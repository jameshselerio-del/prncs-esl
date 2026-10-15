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
    }
  | {
      registered: false;
      email: string;
      /** Name from the Google account, to prefill the sign-up form. */
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

export interface UpdateBookingPayload extends BookingDetails {
  id: string;
  /** Only COMPLETED / NO_SHOW are accepted here; cancelling has its own action. */
  status?: Extract<BookingStatus, 'COMPLETED' | 'NO_SHOW'>;
}

export type LessonInput = Pick<Lesson, 'title' | 'level' | 'summary' | 'content' | 'materialsUrl'> & {
  /** Omit to create a new lesson. */
  id?: string;
};

type Empty = Record<string, never>;

/** action name → [payload, result] */
export interface Api {
  // Anyone signed in with Google (including not-yet-registered students)
  me: [Empty, MeResult];
  register: [Profile, User];

  // Students and teacher
  updateProfile: [Profile, User];
  lessons: [Empty, Lesson[]];
  availability: [Empty, Slot[]];
  myBookings: [Empty, StudentBooking[]];
  book: [BookPayload, StudentBooking];
  cancelBooking: [{ id: string; reason: string }, StudentBooking];

  // Teacher only
  allBookings: [Empty, TeacherBooking[]];
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

/** Actions an unregistered (new) Google user may call. */
export const PUBLIC_ACTIONS: readonly Action[] = ['me', 'register'];

/** Actions only the teacher may call. */
export const ADMIN_ACTIONS: readonly Action[] = [
  'allBookings',
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
  idToken: string;
  payload: Api[A][0];
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: 'AUTH' };
