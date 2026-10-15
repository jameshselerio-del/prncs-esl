export type Role = 'ADMIN' | 'STUDENT';
export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
export type Level = 'BEGINNER' | 'ELEMENTARY' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED';

/** Calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** UTC instant, `YYYY-MM-DDTHH:MM:SS.sssZ`. */
export type IsoInstant = string;

/** Wall-clock time, `HH:MM` (24-hour). `24:00` is allowed as an end time. */
export type ClockTime = string;

/** Day of week, 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface User {
  email: string;
  name: string;
  role: Role;
  active: boolean;
  /** IANA time zone used to display times, e.g. `Asia/Tokyo`. */
  timeZone: string;
  level: Level | '';
  nativeLanguage: string;
  goals: string;
  /** Free-form contact for the teacher, e.g. phone, LINE or Skype ID. */
  contact: string;
  createdAt: IsoInstant;
}

/** Profile fields a user may edit themselves. */
export type Profile = Pick<User, 'name' | 'timeZone' | 'level' | 'nativeLanguage' | 'goals' | 'contact'>;

/** A weekly range of teacher availability in teacher (Manila) time. */
export interface AvailabilityRule {
  id: string;
  weekday: Weekday;
  start: ClockTime;
  end: ClockTime;
}

/** Whole teacher-local days the teacher is unavailable. */
export interface TimeOff {
  id: string;
  startDate: IsoDate;
  endDate: IsoDate;
  note: string;
}

export interface Booking {
  id: string;
  studentEmail: string;
  start: IsoInstant;
  end: IsoInstant;
  status: BookingStatus;
  lessonId: string | null;
  /** What the student wants to focus on, or the topic the teacher sets. */
  topic: string;
  studentNote: string;
  meetingLink: string;
  materials: string;
  /** Teacher's feedback after the class; visible to the student. */
  feedback: string;
  /** Teacher-only note; never sent to students. */
  privateNote: string;
  createdAt: IsoInstant;
  cancelledAt: IsoInstant | null;
  cancelledBy: string | null;
  cancelReason: string;
  reminderSentAt: IsoInstant | null;
}

export interface Lesson {
  id: string;
  title: string;
  level: Level | '';
  summary: string;
  /** Lesson contents shown to students (plain text; blank lines separate paragraphs). */
  content: string;
  materialsUrl: string;
  createdAt: IsoInstant;
}

export interface Settings {
  schoolName: string;
  lessonMinutes: number;
  slotStepMinutes: number;
  minNoticeHours: number;
  bookingWindowDays: number;
  cancelNoticeHours: number;
  maxUpcomingPerStudent: number;
  defaultMeetingLink: string;
}

export interface Slot {
  start: IsoInstant;
  end: IsoInstant;
}
