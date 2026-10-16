import type { Inbox } from './notifications';
import type { BookingDetails } from './validation';
import type {
  AvailabilityRule,
  Booking,
  BookingStatus,
  IsoInstant,
  Lesson,
  Profile,
  Settings,
  Slot,
  TimeOff,
  User,
} from './types';

/** The contract between the SPA and the Apps Script backend. */

export type MeResult =
  | {
      registered: true;
      user: User;
      settings: Settings;
      /** The username for password sign-in, or null if the user only signs in with Google. */
      username: string | null;
    }
  | {
      registered: false;
      email: string;
      /** Name from the Google account, to prefill the sign-up form (empty after password sign-up). */
      suggestedName: string;
      settings: Settings;
    };

/** A booking as a student sees it: no private teacher note. */
export type StudentBooking = Omit<Booking, 'privateNote'>;

export interface TeacherBooking extends Booking {
  studentName: string;
}

export interface StudentSummary extends User {
  upcoming: number;
  completed: number;
  cancelled: number;
  noShows: number;
  lastClass: IsoInstant | null;
}

export interface Schedule {
  rules: AvailabilityRule[];
  timeOff: TimeOff[];
  settings: Settings;
}

export interface BookPayload {
  start: IsoInstant;
  topic: string;
  studentNote: string;
}

export interface BookForStudentPayload {
  studentEmail: string;
  start: IsoInstant;
  topic: string;
  studentNote: string;
}

export interface UpdateBookingPayload extends BookingDetails {
  id: string;
  /** Only COMPLETED / NO_SHOW are accepted here; cancelling has its own action. */
  status?: Extract<BookingStatus, 'COMPLETED' | 'NO_SHOW'>;
}

export interface SetPasswordPayload {
  username: string;
  /** Required when the account already has a password. */
  currentPassword: string;
  newPassword: string;
}

/** A signed session for password sign-in; the SPA sends it in place of a Google ID token. */
export interface SessionToken {
  token: string;
}

export type LessonInput = Pick<Lesson, 'title' | 'level' | 'summary' | 'content' | 'materialsUrl'> & {
  /** Omit to create a new lesson. */
  id?: string;
};

type Empty = Record<string, never>;

/** action name → [payload, result] */
export interface Api {
  // Signed out: password sign-in and reset (no token needed)
  signInWithPassword: [{ login: string; password: string }, SessionToken];
  requestPasswordReset: [{ login: string }, { sent: true }];
  resetPassword: [{ login: string; code: string; newPassword: string }, SessionToken];
  /** Emails a code to confirm the address; the account is created by completeSignUp. */
  requestSignUp: [{ email: string; username: string; password: string }, { sent: true }];
  /** Creates the login and signs in; the new user then completes their profile with `register`. */
  completeSignUp: [{ email: string; code: string }, SessionToken];

  // Anyone signed in with Google (including not-yet-registered students)
  me: [Empty, MeResult];
  register: [Profile, User];

  // Students and teacher
  updateProfile: [Profile, User];
  /** The bell: recent notifications (newest first) and current to-do items. */
  notifications: [Empty, Inbox];
  /** Marks the given notifications, or all of them, as read. */
  markNotificationsRead: [{ ids?: string[]; all?: boolean }, { updated: number }];
  /** Hides a setup suggestion (see DISMISSIBLE_TODOS). */
  dismissTodo: [{ id: string }, { id: string }];
  /** Sets or changes the username and password; returns a fresh session (older ones stop working). */
  setPassword: [SetPasswordPayload, SessionToken & { username: string }];
  lessons: [Empty, Lesson[]];
  availability: [Empty, Slot[]];
  myBookings: [Empty, StudentBooking[]];
  book: [BookPayload, StudentBooking];
  cancelBooking: [{ id: string; reason: string }, StudentBooking];

  // Teacher only
  allBookings: [Empty, TeacherBooking[]];
  bookForStudent: [BookForStudentPayload, TeacherBooking];
  updateBooking: [UpdateBookingPayload, TeacherBooking];
  students: [Empty, StudentSummary[]];
  setStudentActive: [{ email: string; active: boolean }, User];
  schedule: [Empty, Schedule];
  saveSchedule: [{ rules: Omit<AvailabilityRule, 'id'>[]; settings: Settings }, Schedule];
  addTimeOff: [Omit<TimeOff, 'id'>, TimeOff];
  removeTimeOff: [{ id: string }, { id: string }];
  saveLesson: [LessonInput, Lesson];
  deleteLesson: [{ id: string }, { id: string }];
}

export type Action = keyof Api;

/** Actions that need no token: they sign the user in. */
export const SIGNED_OUT_ACTIONS: readonly Action[] = [
  'signInWithPassword',
  'requestPasswordReset',
  'resetPassword',
  'requestSignUp',
  'completeSignUp',
];

/** Actions an unregistered (new) Google user may call. */
export const PUBLIC_ACTIONS: readonly Action[] = ['me', 'register'];

/** Actions only the teacher may call. */
export const ADMIN_ACTIONS: readonly Action[] = [
  'allBookings',
  'bookForStudent',
  'updateBooking',
  'students',
  'setStudentActive',
  'schedule',
  'saveSchedule',
  'addTimeOff',
  'removeTimeOff',
  'saveLesson',
  'deleteLesson',
];

export interface ApiEnvelope<A extends Action = Action> {
  action: A;
  /** A Google ID token, or a password session token (`pw.…`). Empty for SIGNED_OUT_ACTIONS. */
  idToken: string;
  payload: Api[A][0];
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: 'AUTH' };
