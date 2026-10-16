// End-to-end tests of the bundled backend (dist/backend/Code.js) against in-memory Google fakes.
import { execFileSync } from 'node:child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClock } from './fakes.mjs';
import { loadBackend, mockToken } from './backend.mjs';
import { seed, STUDENTS, TEACHER } from './seed.mjs';

const HOUR = 3_600_000;
const NOW = '2026-10-14T00:00:00.000Z'; // Wednesday 08:00 in Manila

const quiet = { log() {}, info() {}, warn() {}, error() {} };
const teacher = mockToken(TEACHER.email, TEACHER.name);
const [yuki, minh] = STUDENTS.map((s) => mockToken(s.email, s.name));

let backend;

function fresh({ seeded = true } = {}) {
  const clock = createClock();
  clock.set(NOW);
  const b = loadBackend({ log: quiet, clock });
  if (seeded) seed(b);
  return b;
}

/** Calls an action and returns its data, failing the test on an API error. */
function ok(token, action, payload) {
  const res = backend.call(token, action, payload);
  if (!res.ok) throw new Error(`${action} failed: ${res.error}`);
  return res.data;
}

/** Calls an action that must fail and returns its error response. */
function err(token, action, payload) {
  const res = backend.call(token, action, payload);
  expect(res.ok, `${action} should fail`).toBe(false);
  return res;
}

const book = (token, start) => backend.call(token, 'book', { start, topic: '', studentNote: '' });
const mailTo = (email) => backend.state.mail.filter((m) => m.to === email);

beforeAll(() => {
  execFileSync(process.execPath, ['backend/build.mjs'], { stdio: 'ignore' });
});

beforeEach(() => {
  backend = fresh();
});

describe('setupDatabase', () => {
  it('migrates a leave-tracking Users tab and keeps the old leave tabs', () => {
    backend = fresh({ seeded: false });
    const ss = backend.google.SpreadsheetApp.create('Leave tracking');
    backend.state.properties.set('SPREADSHEET_ID', ss.getId());
    const legacyHeader = [
      'email',
      'name',
      'office',
      'role',
      'managerEmail',
      'status',
      'regularizedOn',
      'workingDays',
      'active',
    ];
    ss.insertSheet('Users', [
      legacyHeader,
      ['Boss@Example.com', 'Boss', 'PH', 'ADMIN', '', 'REGULAR', '', 'Mon-Fri', 'TRUE'],
      ['ken@example.com', 'Ken', 'JP', 'EMPLOYEE', 'boss@example.com', 'REGULAR', '', 'Mon-Fri', 'TRUE'],
      ['gone@example.com', 'Gone', 'PH', 'EMPLOYEE', '', 'PROBATION', '', 'Mon-Fri', 'FALSE'],
    ]);
    ss.insertSheet('Requests', [
      ['id', 'email'],
      ['r1', 'ken@example.com'],
    ]);

    backend.setupDatabase();

    const users = backend.sheet('Users');
    expect(users.data[0]).toEqual([
      'email',
      'name',
      'role',
      'active',
      'timeZone',
      'level',
      'nativeLanguage',
      'goals',
      'contact',
      'createdAt',
    ]);
    expect(users.records().map(({ email, role, active, timeZone }) => ({ email, role, active, timeZone }))).toEqual([
      { email: 'boss@example.com', role: 'ADMIN', active: 'TRUE', timeZone: 'Asia/Manila' },
      { email: 'ken@example.com', role: 'STUDENT', active: 'TRUE', timeZone: 'Asia/Tokyo' },
      { email: 'gone@example.com', role: 'STUDENT', active: 'FALSE', timeZone: 'Asia/Manila' },
    ]);
    expect(ss.getSheets().map((s) => s.getName())).toEqual(
      expect.arrayContaining(['old_Requests', 'Bookings', 'Availability', 'Lessons', 'TimeOff', 'Settings']),
    );
    expect(ss.getSheetByName('Requests')).toBeNull();
    expect(ss.getSheetByName('Sheet1')).toBeNull();

    // Running it again changes nothing, and the migrated admin is the teacher.
    backend.setupDatabase();
    expect(backend.sheet('Users').records()).toHaveLength(3);
    expect(ok('boss@example.com|Boss', 'me').user.role).toBe('ADMIN');
    expect(err('gone@example.com|Gone', 'me').code).toBe('AUTH');
  });
});

describe('sign-in and sign-up', () => {
  const newStudent = mockToken('nora@example.com', 'Nora New');
  const profile = {
    name: 'Nora',
    timeZone: 'Europe/Berlin',
    level: '',
    nativeLanguage: 'German',
    goals: '',
    contact: '',
  };

  it('rejects missing and invalid tokens', () => {
    expect(err('', 'me').code).toBe('AUTH');
    expect(err('not-a-token', 'me').code).toBe('AUTH');
  });

  it('lets a new Google user register as a student', () => {
    expect(ok(newStudent, 'me')).toMatchObject({
      registered: false,
      email: 'nora@example.com',
      suggestedName: 'Nora New',
    });
    expect(err(newStudent, 'availability').error).toMatch(/complete your profile/);
    expect(err(newStudent, 'register', { ...profile, timeZone: 'Tokyo' }).error).toMatch(/time zone/);

    const user = ok(newStudent, 'register', profile);
    expect(user).toMatchObject({ email: 'nora@example.com', role: 'STUDENT', active: true, timeZone: 'Europe/Berlin' });
    expect(ok(newStudent, 'me')).toMatchObject({ registered: true, user: { name: 'Nora' } });
    expect(err(newStudent, 'register', profile).error).toMatch(/already registered/);
    expect(ok(newStudent, 'availability').length).toBeGreaterThan(0);
  });
});

describe('booking', () => {
  it('books a free slot, notifies both sides and removes the slot', () => {
    const [slot] = ok(yuki, 'availability');
    // Minimum notice is 12 hours.
    expect(Date.parse(slot.start) - Date.parse(NOW)).toBeGreaterThanOrEqual(12 * HOUR);

    const booking = ok(yuki, 'book', { start: slot.start, topic: 'Travel', studentNote: 'Hi!' });
    expect(booking).toMatchObject({ studentEmail: 'yuki@example.com', status: 'CONFIRMED', topic: 'Travel' });
    expect(booking).not.toHaveProperty('privateNote');
    expect(mailTo('yuki@example.com').map((m) => m.subject)).toEqual([
      '[Komorebi English (mock)] Your class is booked',
    ]);
    expect(mailTo(TEACHER.email)[0].body).toContain('Yuki Tanaka');
    expect(ok(yuki, 'availability').some((s) => s.start === slot.start)).toBe(false);
    expect(ok(teacher, 'allBookings').find((b) => b.id === booking.id)).toMatchObject({ studentName: 'Yuki Tanaka' });
  });

  it('rejects double-booking, off-schedule times and teacher bookings', () => {
    const [slot] = ok(yuki, 'availability');
    expect(book(yuki, slot.start).ok).toBe(true);
    expect(book(minh, slot.start).error).toMatch(/no longer available/);
    // 30 minutes later overlaps the 50-minute class.
    const overlapping = new Date(Date.parse(slot.start) + 30 * 60_000).toISOString();
    expect(book(minh, overlapping).error).toMatch(/no longer available/);
    expect(book(minh, '2026-10-17T02:00:00.000Z').error).toMatch(/no longer available/); // Saturday
    expect(book(minh, 'garbage').ok).toBe(false);
    expect(book(teacher, ok(yuki, 'availability')[0].start).error).toMatch(/Only students/);
  });

  it('limits how many upcoming classes a student holds', () => {
    // Yuki already has one upcoming class from the seed; the default limit is 5.
    const slots = ok(yuki, 'availability');
    for (let i = 0; i < 4; i++) expect(book(yuki, slots[i * 4].start).ok).toBe(true);
    expect(book(yuki, slots[30].start).error).toMatch(/already have 5 upcoming classes/);
    expect(book(minh, slots[30].start).ok).toBe(true);
  });
});

describe('calendar invites', () => {
  const ics = (message) => message.attachments?.[0]?.getDataAsString().replace(/\r\n /g, '') ?? '';

  it('attaches an invite to the student and an event to the teacher, then cancels both', () => {
    const [slot] = ok(yuki, 'availability');
    const booking = ok(yuki, 'book', { start: slot.start, topic: 'Travel', studentNote: '' });
    const [studentMail] = mailTo('yuki@example.com');
    const [teacherMail] = mailTo(TEACHER.email);
    const stamp = slot.start.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    expect(studentMail.attachments[0].getContentType()).toBe('text/calendar; charset=utf-8; method=REQUEST');
    expect(ics(studentMail)).toContain(`UID:${booking.id}@prncs-esl`);
    expect(ics(studentMail)).toContain(`DTSTART:${stamp}`);
    expect(ics(studentMail)).toContain(`ORGANIZER;CN="${TEACHER.name}":mailto:${TEACHER.email}`);
    expect(ics(studentMail)).toContain('mailto:yuki@example.com');
    expect(ics(teacherMail)).toContain('METHOD:PUBLISH');
    expect(ics(teacherMail)).toContain('SUMMARY:English class: Yuki Tanaka');

    ok(yuki, 'cancelBooking', { id: booking.id, reason: '' });
    const studentCancel = mailTo('yuki@example.com').at(-1);
    const teacherCancel = mailTo(TEACHER.email).at(-1);
    for (const m of [studentCancel, teacherCancel]) {
      expect(ics(m)).toContain('METHOD:CANCEL');
      expect(ics(m)).toContain('SEQUENCE:1');
      expect(ics(m)).toContain(`UID:${booking.id}@prncs-esl`);
    }
    expect(studentCancel.subject).toMatch(/You cancelled a class/);
  });

  it('sends no invite with reminders', () => {
    const next = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    backend.clock.set(Date.parse(next.start) - 20 * HOUR);
    backend.sendReminders();
    const reminders = backend.state.mail.filter((x) => /Reminder/.test(x.subject));
    expect(reminders.length).toBeGreaterThan(0);
    for (const m of reminders) expect(m.attachments ?? []).toEqual([]);
  });
});

describe('teacher books for a student', () => {
  const saturday = '2026-10-17T02:00:00.000Z'; // outside weekly availability
  const forYuki = (start, extra = {}) =>
    backend.call(teacher, 'bookForStudent', {
      studentEmail: 'Yuki@Example.com',
      start,
      topic: 'Make-up class',
      studentNote: '',
      ...extra,
    });

  it('books any free future time, emails only the student, and blocks that time for others', () => {
    const res = forYuki(saturday);
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      studentEmail: 'yuki@example.com',
      studentName: 'Yuki Tanaka',
      status: 'CONFIRMED',
    });
    expect(mailTo('yuki@example.com').map((m) => m.subject)).toEqual([
      '[Komorebi English (mock)] Your teacher booked a class for you',
    ]);
    expect(mailTo(TEACHER.email)).toEqual([]);
    expect(ok(yuki, 'myBookings').some((b) => b.id === res.data.id)).toBe(true);
    expect(forYuki(new Date(Date.parse(saturday) + 20 * 60_000).toISOString()).error).toMatch(/overlaps/);
  });

  it('rejects past times, students calling it, unknown and deactivated students', () => {
    expect(forYuki('2026-10-13T02:00:00.000Z').error).toMatch(/future/);
    expect(err(yuki, 'bookForStudent', { studentEmail: 'yuki@example.com', start: saturday }).error).toMatch(
      /Only the teacher/,
    );
    expect(forYuki(saturday, { studentEmail: TEACHER.email }).error).toBe('Student not found.');
    ok(teacher, 'setStudentActive', { email: 'yuki@example.com', active: false });
    expect(forYuki(saturday).error).toMatch(/deactivated/);
  });
});

describe('cancelling', () => {
  it('lets students cancel their own classes only before the notice period', () => {
    const later = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    expect(err(minh, 'cancelBooking', { id: later.id, reason: '' }).error).toBe('Booking not found.');

    const cancelled = ok(yuki, 'cancelBooking', { id: later.id, reason: 'Sick' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'yuki@example.com', cancelReason: 'Sick' });
    expect(cancelled).not.toHaveProperty('privateNote');
    expect(mailTo(TEACHER.email).at(-1).subject).toMatch(/Cancelled: Yuki Tanaka/);
    expect(ok(yuki, 'availability').some((s) => s.start === later.start)).toBe(true);
    expect(err(yuki, 'cancelBooking', { id: later.id, reason: '' }).ok).toBe(false);

    // Inside the 24-hour notice window the student can no longer cancel.
    const minhNext = ok(minh, 'myBookings').find((b) => b.status === 'CONFIRMED');
    backend.clock.set(Date.parse(minhNext.start) - 23 * HOUR);
    expect(err(minh, 'cancelBooking', { id: minhNext.id, reason: '' }).error).toMatch(/at least 24 hours/);
  });

  it('lets the teacher cancel any upcoming class but not past ones', () => {
    const minhNext = ok(minh, 'myBookings').find((b) => b.status === 'CONFIRMED');
    backend.clock.set(Date.parse(minhNext.start) - HOUR);
    const cancelled = ok(teacher, 'cancelBooking', { id: minhNext.id, reason: 'Power outage' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: TEACHER.email });
    expect(mailTo('minh@example.com').at(-1)).toMatchObject({
      subject: '[Komorebi English (mock)] Your class was cancelled',
    });
    expect(mailTo('minh@example.com').at(-1).body).toContain('Reason: Power outage');

    expect(err(teacher, 'cancelBooking', { id: 'booking-yuki-past', reason: '' }).error).toMatch(/Only upcoming/);
    expect(err(teacher, 'cancelBooking', { id: 'nope', reason: '' }).error).toBe('Booking not found.');
  });
});

describe('teacher-only data', () => {
  it('never sends private notes to students', () => {
    const past = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-past');
    expect(past.feedback).toMatch(/Great progress/);
    expect(past).not.toHaveProperty('privateNote');
    expect(backend.post(JSON.stringify({ action: 'myBookings', idToken: yuki }))).not.toContain('push for longer');

    const updated = ok(teacher, 'updateBooking', {
      id: 'booking-yuki-next',
      lessonId: 'lesson-interviews',
      topic: 'Emails',
      meetingLink: 'https://meet.example.com/x',
      materials: '',
      feedback: '',
      privateNote: 'Secret plan',
    });
    expect(updated.privateNote).toBe('Secret plan');
    expect(JSON.stringify(ok(yuki, 'myBookings'))).not.toContain('Secret plan');
    expect(ok(teacher, 'allBookings').find((b) => b.id === 'booking-yuki-next').privateNote).toBe('Secret plan');
  });

  it('rejects teacher actions from students', () => {
    for (const action of ['allBookings', 'students', 'schedule', 'updateBooking', 'setStudentActive', 'saveLesson']) {
      expect(err(yuki, action, {}).error).toBe('Only the teacher can do this.');
    }
  });

  it('records outcomes only after a class has started', () => {
    const details = {
      id: 'booking-yuki-next',
      lessonId: '',
      topic: '',
      meetingLink: '',
      materials: '',
      feedback: '',
      privateNote: '',
    };
    expect(err(teacher, 'updateBooking', { ...details, status: 'COMPLETED' }).error).toMatch(
      /after the class has started/,
    );
    backend.clock.set(Date.parse(ok(yuki, 'myBookings').find((b) => b.id === details.id).start) + HOUR);
    expect(ok(teacher, 'updateBooking', { ...details, status: 'NO_SHOW' }).status).toBe('NO_SHOW');
  });
});

describe('sendReminders', () => {
  it('emails each class starting within 24 hours exactly once', () => {
    const yukiNext = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    backend.clock.set(Date.parse(yukiNext.start) - 20 * HOUR);

    backend.sendReminders();
    const reminders = backend.state.mail.filter((m) => m.subject.includes('Reminder'));
    expect(reminders.map((m) => m.to)).toEqual(['yuki@example.com']);
    // Times are shown in the student's own time zone (Tokyo is Manila + 1h).
    expect(reminders[0].body).toMatch(/11:00 AM – 11:50 AM \(Asia\/Tokyo\)/);
    expect(
      backend
        .sheet('Bookings')
        .records()
        .find((r) => r.id === yukiNext.id).reminderSentAt,
    ).not.toBe('');

    backend.sendReminders();
    expect(backend.state.mail.filter((m) => m.subject.includes('Reminder'))).toHaveLength(1);
  });
});

describe('deactivation', () => {
  it('blocks a deactivated student until reactivated', () => {
    expect(ok(teacher, 'setStudentActive', { email: 'minh@example.com', active: false }).active).toBe(false);
    expect(err(minh, 'me')).toMatchObject({ code: 'AUTH', error: expect.stringMatching(/deactivated/) });
    expect(err(minh, 'availability').code).toBe('AUTH');

    // No reminder for a deactivated student's class.
    const minhNext = backend
      .sheet('Bookings')
      .records()
      .find((r) => r.id === 'booking-minh-next');
    backend.clock.set(Date.parse(minhNext.start) - 2 * HOUR);
    backend.sendReminders();
    expect(mailTo('minh@example.com')).toHaveLength(0);

    expect(err(teacher, 'setStudentActive', { email: TEACHER.email, active: false }).error).toBe('Student not found.');
    ok(teacher, 'setStudentActive', { email: 'minh@example.com', active: true });
    expect(ok(minh, 'me').registered).toBe(true);
  });
});

describe('seedDemoData (staging)', () => {
  const owner = mockToken('owner@gmail.com', 'Owner');

  beforeEach(() => {
    backend = fresh({ seeded: false });
  });

  it('refuses to run outside staging or without ADMIN_EMAIL', () => {
    expect(() => backend.seedDemoData()).toThrow(/ENVIRONMENT/);
    backend.state.properties.set('ENVIRONMENT', 'staging');
    expect(() => backend.seedDemoData()).toThrow(/ADMIN_EMAIL/);
  });

  it('fills an empty database once, with the owner as teacher, and never emails demo students', () => {
    backend.state.properties.set('ENVIRONMENT', 'staging');
    backend.state.properties.set('ADMIN_EMAIL', 'Owner@Gmail.com');
    backend.seedDemoData();

    expect(backend.spreadsheet().getName()).toBe('ESL Class Booking — Database (staging)');
    const me = ok(owner, 'me');
    expect(me).toMatchObject({
      registered: true,
      user: { role: 'ADMIN' },
      settings: { schoolName: 'Komorebi English (staging)' },
    });
    const bookings = ok(owner, 'allBookings');
    expect(bookings).toHaveLength(4);
    expect(ok(owner, 'students').map((s) => s.email)).toEqual([
      'minh@demo.invalid',
      'sofia@demo.invalid',
      'yuki@demo.invalid',
    ]);
    expect(ok(owner, 'availability').length).toBeGreaterThan(0);
    expect(() => backend.seedDemoData()).toThrow(/already has data/);

    const upcoming = bookings.find((b) => b.status === 'CONFIRMED' && b.studentEmail === 'sofia@demo.invalid');
    ok(owner, 'cancelBooking', { id: upcoming.id, reason: 'Testing' });
    backend.sendReminders();
    expect(backend.state.mail.filter((m) => m.to.endsWith('@demo.invalid'))).toEqual([]);
  });
});

describe('launch automation', () => {
  it('installs the hourly reminder trigger on the first request, once', () => {
    expect(backend.state.triggers).toEqual([]);
    ok(yuki, 'me');
    ok(teacher, 'me');
    expect(backend.state.triggers.map((t) => [t.handler, t.everyHours])).toEqual([['sendReminders', 1]]);
    expect(backend.state.properties.get('TRIGGERS_VERSION')).toBe('1');
  });

  it('links emails to the published site unless APP_URL overrides it, and not on staging', () => {
    const [slot] = ok(yuki, 'availability');
    ok(yuki, 'book', { start: slot.start, topic: '', studentNote: '' });
    expect(mailTo('yuki@example.com').at(-1).body).toContain('https://jameshselerio-del.github.io/prncs-esl/');

    backend.state.properties.set('APP_URL', 'https://classes.example.org/');
    ok(minh, 'book', { start: ok(minh, 'availability')[5].start, topic: '', studentNote: '' });
    expect(mailTo('minh@example.com').at(-1).body).toContain('https://classes.example.org/');

    backend.state.properties.delete('APP_URL');
    backend.state.properties.set('ENVIRONMENT', 'staging');
    ok(minh, 'book', { start: ok(minh, 'availability')[10].start, topic: '', studentNote: '' });
    expect(mailTo('minh@example.com').at(-1).body).not.toContain('github.io');
  });
});

describe('password sign-in', () => {
  const signedOut = (action, payload) => backend.call('', action, payload);
  const setYukiPassword = () =>
    ok(yuki, 'setPassword', { username: 'Yuki.T', currentPassword: '', newPassword: 'green tea 123' });

  it('lets a registered user add a username and password, then sign in with either name', () => {
    expect(ok(yuki, 'me').username).toBeNull();
    const { token, username } = setYukiPassword();
    expect(username).toBe('yuki.t');
    expect(token.startsWith('pw.')).toBe(true);
    expect(ok(token, 'me')).toMatchObject({ registered: true, user: { email: 'yuki@example.com' }, username });
    expect(mailTo('yuki@example.com').at(-1).subject).toContain('Password sign-in turned on');

    // The hash is stored apart from Users and is never the password itself.
    const [row] = backend.sheet('Logins').records();
    expect(row).toMatchObject({ email: 'yuki@example.com', username: 'yuki.t' });
    expect(row.passwordHash).toMatch(/^pbkdf2-sha256\$10000\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(JSON.stringify(ok(teacher, 'students'))).not.toContain('pbkdf2');

    for (const login of ['YUKI.T', 'yuki@example.com']) {
      const signedIn = signedOut('signInWithPassword', { login, password: 'green tea 123' });
      expect(signedIn.ok).toBe(true);
      expect(ok(signedIn.data.token, 'myBookings').length).toBeGreaterThan(0);
    }
  });

  it('gives one message for unknown users and wrong passwords, and locks after five failures', () => {
    setYukiPassword();
    const unknown = signedOut('signInWithPassword', { login: 'nobody', password: 'whatever123' });
    const wrong = signedOut('signInWithPassword', { login: 'yuki.t', password: 'wrong password' });
    expect(unknown.error).toBe(wrong.error);
    for (let i = 0; i < 4; i++) signedOut('signInWithPassword', { login: 'yuki.t', password: 'wrong password' });
    const locked = signedOut('signInWithPassword', { login: 'yuki.t', password: 'green tea 123' });
    expect(locked.error).toContain('Too many');
    backend.clock.advance(16 * 60_000);
    expect(signedOut('signInWithPassword', { login: 'yuki.t', password: 'green tea 123' }).ok).toBe(true);
  });

  it('requires the current password to change it, and ends older sessions', () => {
    const { token: first } = setYukiPassword();
    const res = err(yuki, 'setPassword', {
      username: 'yuki.t',
      currentPassword: 'nope',
      newPassword: 'matcha latte 9',
    });
    expect(res.error).toContain('current password');
    const { token: second } = ok(first, 'setPassword', {
      username: 'yuki.t',
      currentPassword: 'green tea 123',
      newPassword: 'matcha latte 9',
    });
    expect(err(first, 'me').code).toBe('AUTH');
    expect(ok(second, 'me').registered).toBe(true);
    expect(mailTo('yuki@example.com').at(-1).subject).toContain('Your password was changed');
    expect(signedOut('signInWithPassword', { login: 'yuki.t', password: 'green tea 123' }).ok).toBe(false);
  });

  it('rejects taken usernames, weak passwords and unregistered users', () => {
    setYukiPassword();
    expect(
      err(minh, 'setPassword', { username: 'yuki.t', currentPassword: '', newPassword: 'pho bo 12345' }).error,
    ).toContain('taken');
    expect(err(minh, 'setPassword', { username: 'minh', currentPassword: '', newPassword: 'short' }).error).toContain(
      'at least 8',
    );
    expect(
      err(minh, 'setPassword', { username: 'a@b', currentPassword: '', newPassword: 'pho bo 12345' }).error,
    ).toContain('Username');
    const newcomer = mockToken('new.student@example.com', 'Nora');
    expect(
      err(newcomer, 'setPassword', { username: 'nora', currentPassword: '', newPassword: 'pho bo 12345' }).error,
    ).toContain('profile');
  });

  it('expires sessions, rejects tampered ones and signs out deactivated students', () => {
    const { token } = setYukiPassword();
    const tampered = token.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
    expect(err(tampered, 'me').code).toBe('AUTH');
    ok(teacher, 'setStudentActive', { email: 'yuki@example.com', active: false });
    expect(err(token, 'me').code).toBe('AUTH');
    expect(signedOut('signInWithPassword', { login: 'yuki.t', password: 'green tea 123' }).ok).toBe(false);
    ok(teacher, 'setStudentActive', { email: 'yuki@example.com', active: true });
    expect(ok(token, 'me').registered).toBe(true);
    backend.clock.advance(13 * HOUR);
    expect(err(token, 'me').code).toBe('AUTH');
  });

  it('resets a forgotten password with an emailed code', () => {
    setYukiPassword();
    // Same answer for unknown accounts, and no email.
    const before = backend.state.mail.length;
    expect(signedOut('requestPasswordReset', { login: 'nobody' })).toEqual({ ok: true, data: { sent: true } });
    expect(backend.state.mail.length).toBe(before);

    expect(signedOut('requestPasswordReset', { login: 'yuki.t' }).ok).toBe(true);
    const email = mailTo('yuki@example.com').at(-1);
    expect(email.subject).toContain('reset code');
    const code = /code to reset your password is (\d{6})/.exec(email.body)[1];

    // A second request within a minute sends nothing new.
    signedOut('requestPasswordReset', { login: 'yuki@example.com' });
    expect(mailTo('yuki@example.com').at(-1)).toBe(email);

    const wrong = code === '000000' ? '111111' : '000000';
    expect(signedOut('resetPassword', { login: 'yuki.t', code: wrong, newPassword: 'hojicha 2026' }).ok).toBe(false);
    // A weak password is refused without using up the code.
    expect(signedOut('resetPassword', { login: 'yuki.t', code, newPassword: 'short' }).error).toContain('at least 8');
    const reset = signedOut('resetPassword', { login: 'yuki.t', code, newPassword: 'hojicha 2026' });
    expect(reset.ok).toBe(true);
    expect(ok(reset.data.token, 'me').username).toBe('yuki.t');
    expect(signedOut('signInWithPassword', { login: 'yuki.t', password: 'hojicha 2026' }).ok).toBe(true);
    // Codes work once.
    expect(signedOut('resetPassword', { login: 'yuki.t', code, newPassword: 'another one 1' }).ok).toBe(false);
  });

  it('lets Google-only accounts be found by email but never reset', () => {
    expect(signedOut('requestPasswordReset', { login: 'minh@example.com' }).ok).toBe(true);
    expect(mailTo('minh@example.com')).toEqual([]);
  });
});

describe('password sign-up', () => {
  const signedOut = (action, payload) => backend.call('', action, payload);
  const NEW = { email: 'Kenji@Example.com', username: 'kenji', password: 'sakura 2026' };
  const codeFrom = (email) => /code to finish creating your account is (\d{6})/.exec(mailTo(email).at(-1).body)[1];

  it('confirms the email with a code, then the new user completes a profile', () => {
    expect(signedOut('requestSignUp', NEW)).toEqual({ ok: true, data: { sent: true } });
    const code = codeFrom('kenji@example.com');
    // Nothing is created until the code is used.
    expect(backend.sheet('Logins').records()).toEqual([]);

    const wrong = code === '000000' ? '111111' : '000000';
    expect(signedOut('completeSignUp', { email: NEW.email, code: wrong }).ok).toBe(false);
    const done = signedOut('completeSignUp', { email: NEW.email, code });
    expect(done.ok).toBe(true);
    const token = done.data.token;
    expect(ok(token, 'me')).toMatchObject({ registered: false, email: 'kenji@example.com', suggestedName: '' });
    expect(err(token, 'myBookings').error).toContain('complete your profile');

    ok(token, 'register', {
      name: 'Kenji Sato',
      timeZone: 'Asia/Tokyo',
      level: '',
      nativeLanguage: '',
      goals: '',
      contact: '',
    });
    expect(ok(token, 'me')).toMatchObject({ registered: true, user: { role: 'STUDENT' }, username: 'kenji' });
    expect(signedOut('signInWithPassword', { login: 'kenji', password: NEW.password }).ok).toBe(true);
    expect(signedOut('completeSignUp', { email: NEW.email, code }).ok).toBe(false);
  });

  it('a password sign-up that never finished its profile can still sign in and reset', () => {
    signedOut('requestSignUp', NEW);
    signedOut('completeSignUp', { email: NEW.email, code: codeFrom('kenji@example.com') });
    expect(signedOut('signInWithPassword', { login: 'kenji@example.com', password: NEW.password }).ok).toBe(true);
    signedOut('requestPasswordReset', { login: 'kenji' });
    expect(mailTo('kenji@example.com').at(-1).body).toMatch(/^Hi,\n/);
  });

  it('does not reveal accounts that have a password, and emails their owner instead', () => {
    ok(yuki, 'setPassword', { username: 'yuki.t', currentPassword: '', newPassword: 'green tea 123' });
    const res = signedOut('requestSignUp', { ...NEW, email: 'yuki@example.com', username: 'newyuki' });
    expect(res).toEqual({ ok: true, data: { sent: true } });
    const email = mailTo('yuki@example.com').at(-1);
    expect(email.subject).toContain('already have an account');
    expect(email.body).not.toMatch(/\d{6}/);
    expect(
      backend
        .sheet('Logins')
        .records()
        .map((l) => l.username),
    ).toEqual(['yuki.t']);
  });

  it('lets a user the teacher added in the Sheet sign up into that account', () => {
    backend.insert('Users', [
      { email: 'hana@example.com', name: 'Hana Ito', role: 'STUDENT', active: 'TRUE', timeZone: 'Asia/Tokyo' },
    ]);
    signedOut('requestSignUp', { email: 'Hana@example.com', username: 'hana', password: 'cherry tree 1' });
    const code = codeFrom('hana@example.com');
    const { token } = signedOut('completeSignUp', { email: 'hana@example.com', code }).data;
    expect(ok(token, 'me')).toMatchObject({ registered: true, user: { name: 'Hana Ito' }, username: 'hana' });
  });

  it('lets a Google user without a password sign up to add one', () => {
    signedOut('requestSignUp', { ...NEW, email: 'yuki@example.com', username: 'yuki' });
    const code = codeFrom('yuki@example.com');
    const { token } = signedOut('completeSignUp', { email: 'yuki@example.com', code }).data;
    expect(ok(token, 'me')).toMatchObject({ registered: true, user: { name: 'Yuki Tanaka' }, username: 'yuki' });
  });

  it('sends nothing to deactivated users', () => {
    ok(teacher, 'setStudentActive', { email: 'minh@example.com', active: false });
    expect(signedOut('requestSignUp', { ...NEW, email: 'minh@example.com', username: 'minh' }).ok).toBe(true);
    expect(mailTo('minh@example.com').filter((m) => /code|account/.test(m.subject))).toEqual([]);
  });

  it('validates details, refuses taken usernames and limits codes to one a minute', () => {
    ok(yuki, 'setPassword', { username: 'yuki.t', currentPassword: '', newPassword: 'green tea 123' });
    expect(signedOut('requestSignUp', { ...NEW, username: 'yuki.t' }).error).toContain('taken');
    expect(signedOut('requestSignUp', { ...NEW, email: 'not-an-email' }).error).toContain('valid email');
    expect(signedOut('requestSignUp', { ...NEW, password: 'short' }).error).toContain('at least 8');

    signedOut('requestSignUp', NEW);
    signedOut('requestSignUp', NEW);
    expect(mailTo('kenji@example.com')).toHaveLength(1);
    backend.clock.advance(61_000);
    signedOut('requestSignUp', NEW);
    expect(mailTo('kenji@example.com')).toHaveLength(2);
  });

  it('refuses the code if the username was taken in the meantime', () => {
    signedOut('requestSignUp', NEW);
    const code = codeFrom('kenji@example.com');
    ok(yuki, 'setPassword', { username: 'kenji', currentPassword: '', newPassword: 'green tea 123' });
    expect(signedOut('completeSignUp', { email: NEW.email, code }).error).toContain('took that username');
  });
});

describe('notifications (the bell)', () => {
  const inbox = (token) => ok(token, 'notifications');
  // Ignores the sample notifications from seed.mjs (ids `note-…`).
  const recent = (token) => inbox(token).notifications.filter((n) => !n.id.startsWith('note-'));
  const kinds = (token) => recent(token).map((n) => n.kind);
  const updateYukiNext = (fields) => {
    const b = ok(teacher, 'allBookings').find((x) => x.id === 'booking-yuki-next');
    const { lessonId, topic, meetingLink, materials, feedback, privateNote } = { ...b, ...fields };
    return ok(teacher, 'updateBooking', { id: b.id, lessonId, topic, meetingLink, materials, feedback, privateNote });
  };

  it('tells the teacher about new bookings and student cancellations', () => {
    const [slot] = ok(yuki, 'availability');
    const booked = ok(yuki, 'book', { start: slot.start, topic: 'Travel English', studentNote: 'secret-ish' });
    ok(yuki, 'cancelBooking', { id: booked.id, reason: 'Exam week' });
    const [cancel, created] = recent(teacher);
    expect(created).toMatchObject({ kind: 'NEW_BOOKING', actorName: 'Yuki Tanaka', detail: 'Travel English' });
    expect(cancel).toMatchObject({ kind: 'CANCELLED_BY_STUDENT', detail: 'Exam week', read: false });
    expect(cancel.classStart).toBe(slot.start);
    expect(kinds(yuki)).toEqual([]);
  });

  it('tells students when the teacher books, cancels, adds feedback or a new meeting link', () => {
    const [slot] = ok(teacher, 'schedule') && ok(minh, 'availability');
    ok(teacher, 'bookForStudent', {
      studentEmail: 'minh@example.com',
      start: slot.start,
      topic: 'Verbs',
      studentNote: '',
    });
    ok(teacher, 'cancelBooking', { id: 'booking-yuki-next', reason: 'Teacher is sick' });
    expect(kinds(minh)).toEqual(['BOOKED_FOR_YOU']);
    expect(recent(yuki)[0]).toMatchObject({ kind: 'CANCELLED_BY_TEACHER', detail: 'Teacher is sick' });

    backend = fresh();
    updateYukiNext({ meetingLink: 'https://meet.example.com/new-room', privateNote: 'never shown' });
    updateYukiNext({ feedback: 'Well done!' });
    updateYukiNext({ feedback: 'Well done!' }); // unchanged: nothing new
    expect(kinds(yuki)).toEqual(['FEEDBACK_ADDED', 'LINK_ADDED']);
    expect(JSON.stringify(inbox(yuki))).not.toContain('never shown');
    expect(JSON.stringify(inbox(yuki))).not.toContain('"email"');
  });

  it('marks notifications read, one or all, only for their owner', () => {
    ok(teacher, 'cancelBooking', { id: 'booking-yuki-next', reason: '' });
    ok(teacher, 'cancelBooking', { id: 'booking-minh-next', reason: '' });
    const [mine] = inbox(yuki).notifications;
    // Minh can't mark Yuki's notification.
    expect(ok(minh, 'markNotificationsRead', { ids: [mine.id] }).updated).toBe(0);
    expect(ok(yuki, 'markNotificationsRead', { ids: [mine.id] }).updated).toBe(1);
    expect(inbox(yuki).notifications[0].read).toBe(true);
    expect(ok(minh, 'markNotificationsRead', { all: true }).updated).toBe(1);
    expect(inbox(minh).notifications.every((n) => n.read)).toBe(true);
    expect(err(yuki, 'markNotificationsRead', { ids: 'all' }).error).toBe('Invalid ids.');
  });

  it('lists setup to-dos until done or dismissed', () => {
    expect(inbox(yuki).todos.map((t) => t.id)).toEqual(['set-password']);
    ok(yuki, 'dismissTodo', { id: 'set-password' });
    expect(inbox(yuki).todos).toEqual([]);
    expect(err(yuki, 'dismissTodo', { id: 'record-outcomes' }).error).toContain('cannot be dismissed');
    // Dismissals are per user.
    expect(inbox(minh).todos.map((t) => t.id)).toEqual(['set-password']);
  });

  it('reminds about a class starting soon, and the teacher about outcomes to record', () => {
    const next = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    backend.clock.set(Date.parse(next.start) - 10 * 60_000);
    const soon = inbox(yuki).todos.find((t) => t.kind === 'CLASS_SOON');
    expect(soon).toMatchObject({ id: 'class-soon:booking-yuki-next', meetingLink: next.meetingLink });
    expect(inbox(teacher).todos.find((t) => t.kind === 'CLASS_SOON').studentName).toBe('Yuki Tanaka');
    backend.clock.set(Date.parse(next.end) + 60_000);
    expect(inbox(teacher).todos.find((t) => t.kind === 'RECORD_OUTCOMES').count).toBeGreaterThan(0);
  });

  it('drops notifications older than 30 days', () => {
    ok(teacher, 'cancelBooking', { id: 'booking-yuki-next', reason: '' });
    backend.clock.advance(31 * 24 * HOUR);
    expect(inbox(yuki).notifications).toEqual([]);
    backend.sendReminders();
    expect(backend.sheet('Notifications').records()).toEqual([]);
  });
});
