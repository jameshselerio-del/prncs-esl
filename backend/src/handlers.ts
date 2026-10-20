import type { Action, Api, StudentBooking, StudentSummary, TeacherBooking } from '../../shared/api';
import {
  canRecordOutcome,
  canStudentCancel,
  canTeacherCancel,
  checkNewBooking,
  checkTeacherBooking,
  generateSlots,
  type ScheduleContext,
} from '../../shared/slots';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_MAX_RECIPIENTS,
  ANNOUNCEMENT_TITLE_MAX,
  announcementErrors,
  personalize,
  type SentAnnouncement,
} from '../../shared/announcements';
import {
  DISMISSIBLE_TODOS,
  NOTIFICATION_DAYS,
  todosFor,
  type AppNotification,
  type NotificationKind,
} from '../../shared/notifications';
import { HOUR_MS } from '../../shared/time';
import type { AvailabilityRule, Booking, Level, Profile, Settings, User, Weekday } from '../../shared/types';
import {
  availabilityErrors,
  bookingDetailsErrors,
  hasEmail,
  isEmail,
  lessonErrors,
  noEmailAddress,
  normalizeUsername,
  PASSWORD_MAX,
  passwordErrors,
  profileErrors,
  settingsErrors,
  timeOffErrors,
  USERNAME_MAX,
  usernameErrors,
} from '../../shared/validation';
import type { Identity } from './auth';
import { db, type Login, type StoredAnnouncement, type StoredNotification } from './db';
import { ApiError } from './errors';
import { notify } from './mail';
import {
  checkNotLockedOut,
  clearFailures,
  codeRecentlySent,
  consumeCode,
  createSession,
  hashPassword,
  issueCode,
  recordFailure,
  verifyPassword,
} from './passwords';

export interface Context {
  /** Null for a Google user who has not registered yet (only `me` and `register` allow that). */
  me: User | null;
  identity: Identity;
  now: Date;
}

type Payload = Record<string, unknown>;

/** Serializes writes so two students can't book the same slot. */
function withLock<T>(fn: () => T): T {
  const lock = LockService.getScriptLock();
  lock.waitLock(20_000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function user(ctx: Context): User {
  if (!ctx.me) throw new ApiError('Please complete your profile first.');
  return ctx.me;
}

function text(payload: Payload, field: string, maxLength: number, required = false): string {
  const value = payload[field] ?? '';
  if (typeof value !== 'string') throw new ApiError(`Invalid ${field}.`);
  if (value.length > maxLength) throw new ApiError(`${field} is too long.`);
  if (required && value.trim() === '') throw new ApiError(`Missing ${field}.`);
  return value;
}

function int(payload: Payload, field: string): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ApiError(`Invalid ${field}.`);
  return value;
}

function fail(errors: string[]): void {
  if (errors.length) throw new ApiError(errors.join('\n'));
}

function readProfile(payload: Payload): Profile {
  const profile: Profile = {
    name: text(payload, 'name', 100).trim(),
    timeZone: text(payload, 'timeZone', 64),
    level: text(payload, 'level', 30) as Level | '',
    nativeLanguage: text(payload, 'nativeLanguage', 60).trim(),
    goals: text(payload, 'goals', 1000).trim(),
    contact: text(payload, 'contact', 200).trim(),
  };
  fail(profileErrors(profile));
  return profile;
}

function readSettings(payload: unknown): Settings {
  if (typeof payload !== 'object' || payload === null) throw new ApiError('Missing settings.');
  const p = payload as Payload;
  const settings: Settings = {
    schoolName: text(p, 'schoolName', 100).trim(),
    lessonMinutes: int(p, 'lessonMinutes'),
    slotStepMinutes: int(p, 'slotStepMinutes'),
    minNoticeHours: int(p, 'minNoticeHours'),
    bookingWindowDays: int(p, 'bookingWindowDays'),
    cancelNoticeHours: int(p, 'cancelNoticeHours'),
    maxUpcomingPerStudent: int(p, 'maxUpcomingPerStudent'),
    defaultMeetingLink: text(p, 'defaultMeetingLink', 500).trim(),
  };
  fail(settingsErrors(settings));
  return settings;
}

const studentView = ({ privateNote, ...rest }: Booking): StudentBooking => rest;

function teacherView(b: Booking, users: User[]): TeacherBooking {
  return { ...b, studentName: users.find((u) => u.email === b.studentEmail)?.name ?? b.studentEmail };
}

const teacherOf = (users: User[]): User | undefined => users.find((u) => u.role === 'ADMIN' && u.active);

function scheduleContext(now: Date): ScheduleContext {
  return { rules: db.rules(), timeOff: db.timeOff(), bookings: db.bookings(), settings: db.settings(), now };
}

/** Adds a bell notification for `email` about booking `b`. Call inside withLock, next to the matching email. */
function addNotification(
  email: string | undefined,
  kind: NotificationKind,
  b: Booking,
  now: Date,
  extra: { actorName?: string; detail?: string } = {},
): void {
  if (!email) return;
  db.insertNotification({
    id: Utilities.getUuid(),
    email,
    kind,
    bookingId: b.id,
    classStart: b.start,
    actorName: extra.actorName ?? '',
    detail: extra.detail ?? '',
    createdAt: now.toISOString(),
    readAt: null,
  });
}

/** The teacher's view of a stored announcement. */
function sentView(a: StoredAnnouncement, users: User[]): SentAnnouncement {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    sentAt: a.sentAt,
    emailed: a.emailed,
    recipients: a.recipients.map((email) => ({ email, name: users.find((u) => u.email === email)?.name ?? email })),
  };
}

const notificationView = ({ email, readAt, ...rest }: StoredNotification): AppNotification => ({
  ...rest,
  read: readAt !== null,
});

function findBooking(id: string): Booking {
  const booking = db.bookings().find((b) => b.id === id);
  if (!booking) throw new ApiError('Booking not found.');
  return booking;
}

type Handler<A extends Action> = (ctx: Context, payload: Payload) => Api[A][1];

const INCORRECT_LOGIN = 'Incorrect username or password.';
const DUMMY_HASH = `pbkdf2-sha256$10000$${'0'.repeat(32)}$${'0'.repeat(64)}`;

/** A login's owner: their Users row, or just the email if they signed up but haven't finished their profile. */
type Owner = Pick<User, 'email' | 'name'>;

/** The login for a username or email, unless its user is deactivated; null if none. */
function findAccount(loginName: string): { login: Login; owner: Owner } | null {
  const key = loginName.trim().toLowerCase();
  if (!key) return null;
  const login = db.logins().find((l) => (key.includes('@') ? l.email === key : l.username === key));
  if (!login) return null;
  const found = db.users().find((u) => u.email === login.email);
  if (found && !found.active) return null;
  return { login, owner: found ?? { email: login.email, name: '' } };
}

/** Stores a new password and returns a session for it; older sessions stop working. */
function savePassword(owner: Owner, username: string, password: string, existing: Login | undefined, now: Date) {
  const login: Login = {
    email: owner.email,
    username,
    passwordHash: hashPassword(password),
    updatedAt: now.toISOString(),
  };
  withLock(() => writeLogin(login));
  clearFailures(owner.email);
  notify.passwordChanged(owner, username, !existing, db.settings());
  return createSession(login, now);
}

/** Inside withLock: adds or replaces a login, refusing a username another account already uses. */
function writeLogin(login: Login): void {
  const logins = db.logins();
  if (logins.some((l) => l.username === login.username && l.email !== login.email)) throw new ApiError(USERNAME_TAKEN);
  if (logins.some((l) => l.email === login.email)) db.updateLogin(login);
  else db.insertLogin(login);
}

/** A student with their class counts, for the teacher's Students page. */
function summarize(u: User, bookings: Booking[], logins: Login[], now: number): StudentSummary {
  const mine = bookings.filter((b) => b.studentEmail === u.email);
  const past = mine.filter((b) => b.status !== 'CANCELLED' && Date.parse(b.start) <= now);
  return {
    ...u,
    username: logins.find((l) => l.email === u.email)?.username ?? null,
    upcoming: mine.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.start) > now).length,
    completed: mine.filter((b) => b.status === 'COMPLETED').length,
    cancelled: mine.filter((b) => b.status === 'CANCELLED').length,
    noShows: mine.filter((b) => b.status === 'NO_SHOW').length,
    lastClass:
      past
        .map((b) => b.start)
        .sort()
        .pop() ?? null,
  };
}

/** Reads and checks a username + password the teacher chose for a student. */
function readStudentLogin(payload: Payload, email: string): { username: string; password: string } {
  const username = normalizeUsername(text(payload, 'username', USERNAME_MAX + 10, true));
  const password = text(payload, 'password', PASSWORD_MAX, true);
  fail([...usernameErrors(username), ...passwordErrors(password, { username, email: hasEmail(email) ? email : '' })]);
  return { username, password };
}

const USERNAME_TAKEN = 'That username is taken. Please choose another.';
const INVALID_CODE = 'That code is incorrect or has expired. Please request a new one.';

/** What a sign-up code holds until it is used: the chosen username and the password's hash (never the password). */
interface SignUpData {
  username: string;
  passwordHash: string;
}

export const handlers: { [A in Action]: Handler<A> } = {
  signInWithPassword(ctx, payload) {
    const loginName = text(payload, 'login', 254, true);
    const password = text(payload, 'password', PASSWORD_MAX, true);
    const account = findAccount(loginName);
    if (!account) {
      // Hash anyway so an unknown username takes as long as a wrong password.
      verifyPassword(password, DUMMY_HASH);
      throw new ApiError(INCORRECT_LOGIN);
    }
    const { email } = account.owner;
    checkNotLockedOut(email);
    if (!verifyPassword(password, account.login.passwordHash)) {
      recordFailure(email);
      throw new ApiError(INCORRECT_LOGIN);
    }
    clearFailures(email);
    return { token: createSession(account.login, ctx.now) };
  },

  requestPasswordReset(ctx, payload) {
    const account = findAccount(text(payload, 'login', 254, true));
    // Same answer either way, so this can't be used to find out who has an account.
    if (account && !codeRecentlySent('reset', account.owner.email, ctx.now)) {
      const code = issueCode('reset', account.owner.email, ctx.now, null);
      notify.passwordResetCode(account.owner, code, db.settings());
    }
    return { sent: true as const };
  },

  resetPassword(ctx, payload) {
    const loginName = text(payload, 'login', 254, true);
    const code = text(payload, 'code', 20, true);
    const newPassword = text(payload, 'newPassword', PASSWORD_MAX, true);
    const account = findAccount(loginName);
    // Before using up the code, so a too-short password doesn't cost the student their code.
    fail(passwordErrors(newPassword, { username: account?.login.username ?? '', email: account?.owner.email ?? '' }));
    if (!account) throw new ApiError(INVALID_CODE);
    const { login, owner } = account;
    // Wrong codes share the sign-in attempt limit, so codes can't be guessed by re-requesting them.
    checkNotLockedOut(owner.email);
    if (!consumeCode('reset', owner.email, code, ctx.now)) {
      recordFailure(owner.email);
      throw new ApiError(INVALID_CODE);
    }
    return { token: savePassword(owner, login.username, newPassword, login, ctx.now) };
  },

  requestSignUp(ctx, payload) {
    const email = text(payload, 'email', 254, true).trim().toLowerCase();
    const username = normalizeUsername(text(payload, 'username', USERNAME_MAX + 10, true));
    const password = text(payload, 'password', PASSWORD_MAX, true);
    fail([
      ...(isEmail(email) && hasEmail(email) ? [] : ['Enter a valid email address.']),
      ...usernameErrors(username),
      ...passwordErrors(password, { username, email }),
    ]);
    const logins = db.logins();
    if (logins.some((l) => l.username === username && l.email !== email)) throw new ApiError(USERNAME_TAKEN);
    if (codeRecentlySent('signup', email, ctx.now)) return { sent: true as const };

    // Same answer whatever the email's state; the owner learns the rest by email.
    // A Users row without a password (a Google user, or one the teacher added in the Sheet) may
    // sign up: the code proves they own the email, and they land in that existing account.
    const settings = db.settings();
    const user = db.users().find((u) => u.email === email);
    if (user && !user.active) {
      // Deactivated: nothing to send; the teacher has to reactivate them first.
    } else if (logins.some((l) => l.email === email)) {
      issueCode('signup', email, ctx.now, null);
      notify.alreadyRegistered(email, settings);
    } else {
      const data: SignUpData = { username, passwordHash: hashPassword(password) };
      notify.signUpCode(email, issueCode('signup', email, ctx.now, data), settings);
    }
    return { sent: true as const };
  },

  completeSignUp(ctx, payload) {
    const email = text(payload, 'email', 254, true).trim().toLowerCase();
    const code = text(payload, 'code', 20, true);
    checkNotLockedOut(email);
    const used = consumeCode<SignUpData | null>('signup', email, code, ctx.now);
    if (!used?.data) {
      recordFailure(email);
      throw new ApiError(INVALID_CODE);
    }
    const login: Login = { email, ...used.data, updatedAt: ctx.now.toISOString() };
    withLock(() => {
      const logins = db.logins();
      if (logins.some((l) => l.email === email))
        throw new ApiError('This email already has an account. Please sign in.');
      if (logins.some((l) => l.username === login.username)) {
        throw new ApiError('Someone just took that username. Please sign up again with another one.');
      }
      db.insertLogin(login);
    });
    clearFailures(email);
    return { token: createSession(login, ctx.now) };
  },

  me(ctx) {
    const settings = db.settings();
    if (!ctx.me) {
      return { registered: false, email: ctx.identity.email, suggestedName: ctx.identity.name, settings };
    }
    const email = ctx.me.email;
    const username = db.logins().find((l) => l.email === email)?.username ?? null;
    return { registered: true, user: ctx.me, settings, username };
  },

  register(ctx, payload) {
    const profile = readProfile(payload);
    return withLock(() => {
      const existing = db.users().find((u) => u.email === ctx.identity.email);
      if (existing) throw new ApiError('This account is already registered.');
      const created: User = {
        ...profile,
        email: ctx.identity.email,
        role: 'STUDENT',
        active: true,
        createdAt: ctx.now.toISOString(),
      };
      db.insertUser(created);
      return created;
    });
  },

  updateProfile(ctx, payload) {
    const updated: User = { ...user(ctx), ...readProfile(payload) };
    withLock(() => db.updateUser(updated));
    return updated;
  },

  setPassword(ctx, payload) {
    const me = user(ctx);
    const username = normalizeUsername(text(payload, 'username', USERNAME_MAX + 10, true));
    const currentPassword = text(payload, 'currentPassword', PASSWORD_MAX);
    const newPassword = text(payload, 'newPassword', PASSWORD_MAX, true);
    fail([...usernameErrors(username), ...passwordErrors(newPassword, { username, email: me.email })]);

    const existing = db.logins().find((l) => l.email === me.email);
    if (existing) {
      checkNotLockedOut(me.email);
      if (!verifyPassword(currentPassword, existing.passwordHash)) {
        recordFailure(me.email);
        throw new ApiError('Your current password is incorrect.');
      }
    }
    return { token: savePassword(me, username, newPassword, existing, ctx.now), username };
  },

  notifications(ctx) {
    const me = user(ctx);
    const since = ctx.now.getTime() - NOTIFICATION_DAYS * 24 * HOUR_MS;
    // Newest first; rows are appended in order, so reversing breaks ties within the same millisecond.
    const notifications = db
      .notifications()
      .reverse()
      .filter((n) => n.email === me.email && Date.parse(n.createdAt) >= since)
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .slice(0, 50)
      .map(notificationView);
    const users = db.users();
    const bookings =
      me.role === 'ADMIN'
        ? db.bookings().map((b) => teacherView(b, users))
        : db.bookings().filter((b) => b.studentEmail === me.email);
    const todos = todosFor({
      user: me,
      hasPassword: db.logins().some((l) => l.email === me.email),
      bookings,
      dismissed: db
        .dismissals()
        .filter((d) => d.email === me.email)
        .map((d) => d.todo),
      now: ctx.now,
    });
    return { notifications, todos };
  },

  markNotificationsRead(ctx, payload) {
    const me = user(ctx);
    const all = payload.all === true;
    const ids = payload.ids ?? [];
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || id.length > 64)) {
      throw new ApiError('Invalid ids.');
    }
    return withLock(() => {
      let updated = 0;
      const rows = db.notifications().map((n) => {
        if (n.email !== me.email || n.readAt || !(all || ids.includes(n.id))) return n;
        updated++;
        return { ...n, readAt: ctx.now.toISOString() };
      });
      if (updated) db.replaceNotifications(rows);
      return { updated };
    });
  },

  dismissTodo(ctx, payload) {
    const me = user(ctx);
    const id = text(payload, 'id', 40, true);
    if (!DISMISSIBLE_TODOS.includes(id)) throw new ApiError('This item cannot be dismissed.');
    withLock(() => {
      const done = db.dismissals().some((d) => d.email === me.email && d.todo === id);
      if (!done) db.insertDismissal(me.email, id, ctx.now.toISOString());
    });
    return { id };
  },

  myAnnouncements(ctx) {
    const me = user(ctx);
    return db
      .announcements()
      .filter((a) => a.recipients.includes(me.email))
      .reverse()
      .map((a) => ({ id: a.id, title: personalize(a.title, me), body: personalize(a.body, me), sentAt: a.sentAt }));
  },

  announcements() {
    const users = db.users();
    return {
      sent: db
        .announcements()
        .reverse()
        .map((a) => sentView(a, users)),
      emailQuota: MailApp.getRemainingDailyQuota(),
    };
  },

  sendAnnouncement(ctx, payload) {
    const title = text(payload, 'title', ANNOUNCEMENT_TITLE_MAX).trim();
    const body = text(payload, 'body', ANNOUNCEMENT_BODY_MAX).trim();
    const raw = payload.recipients;
    if (
      !Array.isArray(raw) ||
      raw.length > ANNOUNCEMENT_MAX_RECIPIENTS ||
      raw.some((e) => typeof e !== 'string' || e.length > 254)
    ) {
      throw new ApiError('Invalid recipients.');
    }
    if (typeof payload.sendEmail !== 'boolean') throw new ApiError('Invalid sendEmail.');
    const recipients = [...new Set((raw as string[]).map((e) => e.trim().toLowerCase()))];
    fail(announcementErrors({ title, body, recipients }));

    const users = db.users();
    const students = recipients.map((email) =>
      users.find((u) => u.email === email && u.role === 'STUDENT' && u.active),
    );
    if (students.some((s) => !s)) {
      throw new ApiError('Some chosen students were not found or are deactivated. Reload the page and try again.');
    }
    const chosen = students as User[];
    const emailable = payload.sendEmail ? chosen.filter((s) => hasEmail(s.email)) : [];
    const quota = MailApp.getRemainingDailyQuota();
    if (emailable.length > quota) {
      throw new ApiError(
        `Google lets this site send ${quota} more emails today, but this announcement needs ${emailable.length}. ` +
          'Untick "Also send by email" (they still see it in the app), choose fewer students, or try tomorrow.',
      );
    }

    const sent: StoredAnnouncement = {
      id: Utilities.getUuid(),
      title,
      body,
      recipients: chosen.map((s) => s.email),
      emailed: payload.sendEmail,
      sentAt: ctx.now.toISOString(),
    };
    withLock(() => {
      db.insertAnnouncement(sent);
      for (const s of chosen) {
        db.insertNotification({
          id: Utilities.getUuid(),
          email: s.email,
          kind: 'ANNOUNCEMENT',
          bookingId: '',
          classStart: '',
          actorName: '',
          detail: personalize(title, s),
          createdAt: ctx.now.toISOString(),
          readAt: null,
        });
      }
    });
    const settings = db.settings();
    for (const s of emailable) notify.announcement(s, personalize(title, s), personalize(body, s), settings);
    return sentView(sent, users);
  },

  lessons() {
    return db.lessons().sort((a, b) => a.title.localeCompare(b.title));
  },

  availability(ctx) {
    user(ctx);
    return generateSlots(scheduleContext(ctx.now));
  },

  myBookings(ctx) {
    const me = user(ctx);
    return db
      .bookings()
      .filter((b) => b.studentEmail === me.email)
      .map(studentView);
  },

  book(ctx, payload) {
    const me = user(ctx);
    if (me.role !== 'STUDENT') throw new ApiError('Only students can book classes.');
    const start = text(payload, 'start', 40, true);
    const topic = text(payload, 'topic', 200).trim();
    const studentNote = text(payload, 'studentNote', 1000).trim();

    const { booking, settings } = withLock(() => {
      const schedule = scheduleContext(ctx.now);
      const result = checkNewBooking(schedule, me.email, start);
      if (!result.slot) throw new ApiError(result.errors.join('\n'));
      const created: Booking = {
        id: Utilities.getUuid(),
        studentEmail: me.email,
        start: result.slot.start,
        end: result.slot.end,
        status: 'CONFIRMED',
        lessonId: null,
        topic,
        studentNote,
        meetingLink: schedule.settings.defaultMeetingLink,
        materials: '',
        feedback: '',
        privateNote: '',
        createdAt: ctx.now.toISOString(),
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: '',
        reminderSentAt: null,
      };
      db.insertBooking(created);
      return { booking: created, settings: schedule.settings };
    });

    const teacher = teacherOf(db.users());
    withLock(() =>
      addNotification(teacher?.email, 'NEW_BOOKING', booking, ctx.now, { actorName: me.name, detail: booking.topic }),
    );
    notify.booked(booking, me, teacher, settings);
    return studentView(booking);
  },

  cancelBooking(ctx, payload) {
    const me = user(ctx);
    const id = text(payload, 'id', 64, true);
    const reason = text(payload, 'reason', 500).trim();
    const isTeacher = me.role === 'ADMIN';

    const { cancelled, settings } = withLock(() => {
      const booking = findBooking(id);
      const settings = db.settings();
      if (isTeacher) {
        if (!canTeacherCancel(booking, ctx.now))
          throw new ApiError('Only upcoming confirmed classes can be cancelled.');
      } else {
        if (booking.studentEmail !== me.email) throw new ApiError('Booking not found.');
        if (!canStudentCancel(booking, ctx.now, settings)) {
          throw new ApiError(
            `Classes can only be cancelled at least ${settings.cancelNoticeHours} hours before they start.`,
          );
        }
      }
      const cancelled: Booking = {
        ...booking,
        status: 'CANCELLED',
        cancelledAt: ctx.now.toISOString(),
        cancelledBy: me.email,
        cancelReason: reason,
      };
      db.updateBooking(cancelled);
      return { cancelled, settings };
    });

    const users = db.users();
    const student = users.find((u) => u.email === cancelled.studentEmail);
    withLock(() =>
      isTeacher
        ? addNotification(cancelled.studentEmail, 'CANCELLED_BY_TEACHER', cancelled, ctx.now, { detail: reason })
        : addNotification(teacherOf(users)?.email, 'CANCELLED_BY_STUDENT', cancelled, ctx.now, {
            actorName: me.name,
            detail: reason,
          }),
    );
    if (student) notify.cancelled(cancelled, student, teacherOf(users), isTeacher, settings);
    return isTeacher ? cancelled : studentView(cancelled);
  },

  bookForStudent(ctx, payload) {
    const email = text(payload, 'studentEmail', 200, true).trim().toLowerCase();
    const start = text(payload, 'start', 40, true);
    const topic = text(payload, 'topic', 200).trim();
    const studentNote = text(payload, 'studentNote', 1000).trim();

    const { booking, student, settings } = withLock(() => {
      const users = db.users();
      const student = users.find((u) => u.email === email);
      if (!student || student.role !== 'STUDENT') throw new ApiError('Student not found.');
      if (!student.active) throw new ApiError(`${student.name} is deactivated. Reactivate them first.`);
      const settings = db.settings();
      const result = checkTeacherBooking(db.bookings(), start, settings, ctx.now);
      if (!result.slot) throw new ApiError(result.errors.join('\n'));
      const created: Booking = {
        id: Utilities.getUuid(),
        studentEmail: student.email,
        start: result.slot.start,
        end: result.slot.end,
        status: 'CONFIRMED',
        lessonId: null,
        topic,
        studentNote,
        meetingLink: settings.defaultMeetingLink,
        materials: '',
        feedback: '',
        privateNote: '',
        createdAt: ctx.now.toISOString(),
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: '',
        reminderSentAt: null,
      };
      db.insertBooking(created);
      addNotification(student.email, 'BOOKED_FOR_YOU', created, ctx.now, { detail: topic });
      return { booking: created, student, settings };
    });

    notify.booked(booking, student, teacherOf(db.users()), settings, true);
    return teacherView(booking, [student]);
  },

  allBookings() {
    const users = db.users();
    return db.bookings().map((b) => teacherView(b, users));
  },

  updateBooking(ctx, payload) {
    const id = text(payload, 'id', 64, true);
    const lessonId = text(payload, 'lessonId', 64) || null;
    const details = {
      lessonId,
      topic: text(payload, 'topic', 200).trim(),
      meetingLink: text(payload, 'meetingLink', 500).trim(),
      materials: text(payload, 'materials', 2000).trim(),
      feedback: text(payload, 'feedback', 5000).trim(),
      privateNote: text(payload, 'privateNote', 5000).trim(),
    };
    fail(bookingDetailsErrors(details));
    const status = payload.status;
    if (status !== undefined && status !== 'COMPLETED' && status !== 'NO_SHOW') throw new ApiError('Invalid status.');

    return withLock(() => {
      const booking = findBooking(id);
      if (lessonId && !db.lessons().some((l) => l.id === lessonId)) throw new ApiError('Lesson not found.');
      if (status && !canRecordOutcome(booking, ctx.now)) {
        throw new ApiError('Completed / no-show can only be recorded after the class has started.');
      }
      const updated: Booking = { ...booking, ...details, status: status ?? booking.status };
      db.updateBooking(updated);
      if (updated.feedback && updated.feedback !== booking.feedback) {
        addNotification(updated.studentEmail, 'FEEDBACK_ADDED', updated, ctx.now);
      }
      const upcoming = updated.status === 'CONFIRMED' && Date.parse(updated.start) > ctx.now.getTime();
      if (upcoming && updated.meetingLink && updated.meetingLink !== booking.meetingLink) {
        addNotification(updated.studentEmail, 'LINK_ADDED', updated, ctx.now);
      }
      return teacherView(updated, db.users());
    });
  },

  students(ctx) {
    const bookings = db.bookings();
    const logins = db.logins();
    return db
      .users()
      .filter((u) => u.role === 'STUDENT')
      .map((u) => summarize(u, bookings, logins, ctx.now.getTime()))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  createStudent(ctx, payload) {
    const profile = readProfile(payload);
    const given = text(payload, 'email', 254).trim().toLowerCase();
    if (given && (!isEmail(given) || !hasEmail(given)))
      throw new ApiError('Enter a valid email address, or leave it empty.');
    const username = normalizeUsername(text(payload, 'username', USERNAME_MAX + 10, true));
    const email = given || noEmailAddress(username);
    const { password } = readStudentLogin(payload, email);

    const student: User = { ...profile, email, role: 'STUDENT', active: true, createdAt: ctx.now.toISOString() };
    const login: Login = { email, username, passwordHash: hashPassword(password), updatedAt: ctx.now.toISOString() };
    withLock(() => {
      if (db.users().some((u) => u.email === email) || db.logins().some((l) => l.email === email)) {
        throw new ApiError(given ? 'A student with this email already exists.' : USERNAME_TAKEN);
      }
      writeLogin(login);
      db.insertUser(student);
    });
    notify.accountCreated(student, username, db.settings());
    return summarize(student, [], [login], ctx.now.getTime());
  },

  setStudentLogin(ctx, payload) {
    const email = text(payload, 'email', 254, true).trim().toLowerCase();
    const student = db.users().find((u) => u.email === email);
    if (!student || student.role !== 'STUDENT') throw new ApiError('Student not found.');
    const { username, password } = readStudentLogin(payload, email);
    const login: Login = { email, username, passwordHash: hashPassword(password), updatedAt: ctx.now.toISOString() };
    withLock(() => writeLogin(login));
    clearFailures(email);
    notify.passwordSetByTeacher(student, username, db.settings());
    return { username };
  },

  setStudentActive(_ctx, payload) {
    const email = text(payload, 'email', 200, true).trim().toLowerCase();
    if (typeof payload.active !== 'boolean') throw new ApiError('Invalid active.');
    const active = payload.active;
    return withLock(() => {
      const student = db.users().find((u) => u.email === email);
      if (!student || student.role !== 'STUDENT') throw new ApiError('Student not found.');
      const updated = { ...student, active };
      db.updateUser(updated);
      return updated;
    });
  },

  schedule() {
    return { rules: db.rules(), timeOff: db.timeOff(), settings: db.settings() };
  },

  saveSchedule(_ctx, payload) {
    if (!Array.isArray(payload.rules) || payload.rules.length > 100) throw new ApiError('Invalid availability.');
    const rules: AvailabilityRule[] = payload.rules.map((r: unknown) => {
      if (typeof r !== 'object' || r === null) throw new ApiError('Invalid availability.');
      const p = r as Payload;
      return {
        id: Utilities.getUuid(),
        weekday: int(p, 'weekday') as Weekday,
        start: text(p, 'start', 5, true),
        end: text(p, 'end', 5, true),
      };
    });
    fail(availabilityErrors(rules));
    const settings = readSettings(payload.settings);

    return withLock(() => {
      const sorted = rules.sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
      db.replaceRules(sorted);
      db.saveSettings(settings);
      return { rules: sorted, timeOff: db.timeOff(), settings };
    });
  },

  addTimeOff(_ctx, payload) {
    const entry = {
      id: Utilities.getUuid(),
      startDate: text(payload, 'startDate', 10, true),
      endDate: text(payload, 'endDate', 10, true),
      note: text(payload, 'note', 200).trim(),
    };
    fail(timeOffErrors(entry));
    withLock(() => db.insertTimeOff(entry));
    return entry;
  },

  removeTimeOff(_ctx, payload) {
    const id = text(payload, 'id', 64, true);
    withLock(() => db.deleteTimeOff(id));
    return { id };
  },

  saveLesson(ctx, payload) {
    const id = text(payload, 'id', 64) || null;
    const fields = {
      title: text(payload, 'title', 120).trim(),
      level: text(payload, 'level', 30) as Level | '',
      summary: text(payload, 'summary', 500).trim(),
      content: text(payload, 'content', 20_000),
      materialsUrl: text(payload, 'materialsUrl', 500).trim(),
    };
    fail(lessonErrors(fields));

    return withLock(() => {
      if (!id) {
        const created = { ...fields, id: Utilities.getUuid(), createdAt: ctx.now.toISOString() };
        db.insertLesson(created);
        return created;
      }
      const existing = db.lessons().find((l) => l.id === id);
      if (!existing) throw new ApiError('Lesson not found.');
      const updated = { ...existing, ...fields };
      db.updateLesson(updated);
      return updated;
    });
  },

  deleteLesson(_ctx, payload) {
    const id = text(payload, 'id', 64, true);
    return withLock(() => {
      const used = db.bookings().filter((b) => b.lessonId === id).length;
      if (used) throw new ApiError(`This lesson is assigned to ${used} booking(s). Remove it from them first.`);
      db.deleteLesson(id);
      return { id };
    });
  },
};

/** Hourly trigger: emails students about confirmed classes starting within 24 hours, once per booking. */
export function sendReminders(): void {
  const now = Date.now();
  const settings = db.settings();
  const users = db.users();
  withLock(() => {
    for (const b of db.bookings()) {
      const startsIn = Date.parse(b.start) - now;
      if (b.status !== 'CONFIRMED' || b.reminderSentAt || startsIn <= 0 || startsIn > 24 * HOUR_MS) continue;
      const student = users.find((u) => u.email === b.studentEmail);
      if (student?.active) notify.reminder(b, student, settings);
      db.updateBooking({ ...b, reminderSentAt: new Date(now).toISOString() });
    }
    // Keep the Notifications tab small: drop what the bell no longer shows.
    const notifications = db.notifications();
    const keep = notifications.filter((n) => Date.parse(n.createdAt) >= now - NOTIFICATION_DAYS * 24 * HOUR_MS);
    if (keep.length < notifications.length) db.replaceNotifications(keep);
  });
}
