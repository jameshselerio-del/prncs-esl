import type { Booking, IsoInstant, User } from './types';

/**
 * In-app notifications (the bell): stored events, written when the matching email is sent,
 * plus "to do" items worked out from the account each time and never stored.
 */

/** How long notifications stay in the bell. */
export const NOTIFICATION_DAYS = 30;
/** A class shows as "starting soon" from this long before it starts until it ends. */
export const CLASS_SOON_MINUTES = 15;

export type NotificationKind =
  // to a student
  | 'BOOKED_FOR_YOU'
  | 'CANCELLED_BY_TEACHER'
  | 'FEEDBACK_ADDED'
  | 'LINK_ADDED'
  | 'ANNOUNCEMENT'
  // to the teacher
  | 'NEW_BOOKING'
  | 'CANCELLED_BY_STUDENT';

export const NOTIFICATION_KINDS: readonly NotificationKind[] = [
  'BOOKED_FOR_YOU',
  'CANCELLED_BY_TEACHER',
  'FEEDBACK_ADDED',
  'LINK_ADDED',
  'ANNOUNCEMENT',
  'NEW_BOOKING',
  'CANCELLED_BY_STUDENT',
];

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  bookingId: string;
  /** The class it is about; the SPA formats it in the viewer's time zone. */
  classStart: IsoInstant;
  /** The student's name, for the teacher's notifications. */
  actorName: string;
  /** Cancellation reason, booking topic (never a private note), or an announcement's title. */
  detail: string;
  createdAt: IsoInstant;
  read: boolean;
}

export type TodoKind = 'SET_PASSWORD' | 'ADD_LEVEL' | 'CLASS_SOON' | 'RECORD_OUTCOMES';

export interface Todo {
  /** Stable per item, e.g. `set-password` or `class-soon:<booking id>`. */
  id: string;
  kind: TodoKind;
  /** Only setup suggestions can be dismissed; the rest go away when done. */
  dismissible: boolean;
  classStart?: IsoInstant;
  meetingLink?: string;
  studentName?: string;
  /** RECORD_OUTCOMES: how many past classes need one. */
  count?: number;
}

/** To-do ids a user may dismiss. */
export const DISMISSIBLE_TODOS: readonly string[] = ['set-password', 'add-level'];

export interface Inbox {
  notifications: AppNotification[];
  todos: Todo[];
}

type TodoBooking = Pick<Booking, 'id' | 'start' | 'end' | 'status' | 'meetingLink'> & { studentName?: string };

/**
 * The to-do items for a user. `bookings` are the user's own (student) or everyone's (teacher).
 */
export function todosFor(input: {
  user: Pick<User, 'role' | 'level'>;
  hasPassword: boolean;
  bookings: TodoBooking[];
  dismissed: readonly string[];
  now: Date;
}): Todo[] {
  const { user, bookings, dismissed, now } = input;
  const t = now.getTime();
  const isTeacher = user.role === 'ADMIN';
  const todos: Todo[] = [];

  for (const b of bookings) {
    const startsIn = Date.parse(b.start) - t;
    if (b.status === 'CONFIRMED' && startsIn <= CLASS_SOON_MINUTES * 60_000 && Date.parse(b.end) > t) {
      todos.push({
        id: `class-soon:${b.id}`,
        kind: 'CLASS_SOON',
        dismissible: false,
        classStart: b.start,
        meetingLink: b.meetingLink,
        ...(isTeacher && b.studentName ? { studentName: b.studentName } : {}),
      });
    }
  }
  todos.sort((a, b) => Date.parse(a.classStart!) - Date.parse(b.classStart!));

  if (isTeacher) {
    const count = bookings.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) <= t).length;
    if (count > 0) todos.push({ id: 'record-outcomes', kind: 'RECORD_OUTCOMES', dismissible: false, count });
  }
  if (!input.hasPassword && !dismissed.includes('set-password')) {
    todos.push({ id: 'set-password', kind: 'SET_PASSWORD', dismissible: true });
  }
  if (!isTeacher && user.level === '' && !dismissed.includes('add-level')) {
    todos.push({ id: 'add-level', kind: 'ADD_LEVEL', dismissible: true });
  }
  return todos;
}

export interface ItemText {
  title: string;
  detail: string;
}

/** What a notification says; `when` is the class time already formatted for the viewer. */
export function notificationText(n: Pick<AppNotification, 'kind' | 'actorName' | 'detail'>, when: string): ItemText {
  switch (n.kind) {
    case 'BOOKED_FOR_YOU':
      return { title: `Your teacher booked a class for you on ${when}.`, detail: n.detail };
    case 'CANCELLED_BY_TEACHER':
      return {
        title: `Your teacher cancelled your class on ${when}.`,
        detail: n.detail ? `Reason: ${n.detail}` : '',
      };
    case 'FEEDBACK_ADDED':
      return { title: `New feedback on your class on ${when}.`, detail: '' };
    case 'LINK_ADDED':
      return { title: `The meeting link for your class on ${when} is ready.`, detail: '' };
    case 'ANNOUNCEMENT':
      return { title: `New announcement: ${n.detail}`, detail: 'From your teacher' };
    case 'NEW_BOOKING':
      return { title: `${n.actorName} booked a class on ${when}.`, detail: n.detail ? `Topic: ${n.detail}` : '' };
    case 'CANCELLED_BY_STUDENT':
      return {
        title: `${n.actorName} cancelled the class on ${when}.`,
        detail: n.detail ? `Reason: ${n.detail}` : '',
      };
  }
}

/** What a to-do says; `when` is the class time (CLASS_SOON) formatted for the viewer. */
export function todoText(todo: Todo, when = ''): ItemText {
  switch (todo.kind) {
    case 'SET_PASSWORD':
      return {
        title: 'Set up a username and password',
        detail: 'So you can also sign in without Google.',
      };
    case 'ADD_LEVEL':
      return { title: 'Add your English level', detail: 'It helps your teacher plan your lessons.' };
    case 'CLASS_SOON':
      return {
        title: todo.studentName ? `Class with ${todo.studentName} at ${when}` : `Your class starts at ${when}`,
        detail: todo.meetingLink ? 'Join when you are ready.' : 'The meeting link will appear on the booking.',
      };
    case 'RECORD_OUTCOMES':
      return {
        title: `Mark ${todo.count} past ${todo.count === 1 ? 'class' : 'classes'} as completed or no-show`,
        detail: 'Students see their class history and feedback.',
      };
  }
}
