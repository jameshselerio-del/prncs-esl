import { parseIsoDate } from './dates';
import { parseClock } from './time';
import type { AvailabilityRule, Lesson, Level, Profile, Settings, TimeOff } from './types';

export const LEVELS: { value: Level; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'ELEMENTARY', label: 'Elementary' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'UPPER_INTERMEDIATE', label: 'Upper intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
];

export const levelLabel = (level: string): string => LEVELS.find((l) => l.value === level)?.label ?? '';

const isLevel = (v: string): boolean => v === '' || LEVELS.some((l) => l.value === v);

/** IANA zone names look like `UTC`, `Asia/Manila` or `America/Argentina/Buenos_Aires`. */
export const isTimeZone = (v: string): boolean => /^(UTC|[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/.test(v) && v.length <= 64;

export function isHttpUrl(v: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(v);
}

function tooLong(errors: string[], label: string, value: string, max: number): void {
  if (value.length > max) errors.push(`${label} must be at most ${max} characters.`);
}

function isDate(v: string): boolean {
  try {
    parseIsoDate(v);
    return true;
  } catch {
    return false;
  }
}

export function profileErrors(p: Profile): string[] {
  const errors: string[] = [];
  if (p.name.trim() === '') errors.push('Name is required.');
  tooLong(errors, 'Name', p.name, 100);
  if (!isTimeZone(p.timeZone)) errors.push('Choose a valid time zone.');
  if (!isLevel(p.level)) errors.push('Choose a valid English level.');
  tooLong(errors, 'Native language', p.nativeLanguage, 60);
  tooLong(errors, 'Goals', p.goals, 1000);
  tooLong(errors, 'Contact', p.contact, 200);
  return errors;
}

export function availabilityErrors(rules: AvailabilityRule[]): string[] {
  const errors: string[] = [];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const r of rules) {
    const day = days[r.weekday] ?? `Day ${r.weekday}`;
    const start = parseClock(r.start);
    const end = parseClock(r.end);
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) errors.push(`${day}: invalid day.`);
    if (start === null || end === null) errors.push(`${day}: times must be HH:MM.`);
    else if (start >= end) errors.push(`${day} ${r.start}–${r.end}: start must be before end.`);
  }
  for (let d = 0; d < 7; d++) {
    const ranges = rules
      .filter((r) => r.weekday === d)
      .map((r) => [parseClock(r.start), parseClock(r.end)] as const)
      .filter((r): r is readonly [number, number] => r[0] !== null && r[1] !== null)
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i][0] < ranges[i - 1][1]) {
        errors.push(`${days[d]}: time ranges overlap.`);
        break;
      }
    }
  }
  return errors;
}

export function timeOffErrors(t: Pick<TimeOff, 'startDate' | 'endDate' | 'note'>): string[] {
  const errors: string[] = [];
  if (!isDate(t.startDate) || !isDate(t.endDate)) errors.push('Dates must be YYYY-MM-DD.');
  else if (t.startDate > t.endDate) errors.push('Start date must be on or before end date.');
  tooLong(errors, 'Note', t.note, 200);
  return errors;
}

const SETTING_RANGES: { key: keyof Settings; label: string; min: number; max: number }[] = [
  { key: 'lessonMinutes', label: 'Lesson length (minutes)', min: 15, max: 180 },
  { key: 'slotStepMinutes', label: 'Slot step (minutes)', min: 5, max: 180 },
  { key: 'minNoticeHours', label: 'Minimum notice (hours)', min: 0, max: 168 },
  { key: 'bookingWindowDays', label: 'Booking window (days)', min: 1, max: 180 },
  { key: 'cancelNoticeHours', label: 'Cancel notice (hours)', min: 0, max: 168 },
  { key: 'maxUpcomingPerStudent', label: 'Max upcoming classes per student', min: 1, max: 50 },
];

export function settingsErrors(s: Settings): string[] {
  const errors: string[] = [];
  if (s.schoolName.trim() === '') errors.push('School name is required.');
  tooLong(errors, 'School name', s.schoolName, 100);
  for (const { key, label, min, max } of SETTING_RANGES) {
    const v = s[key] as number;
    if (!Number.isInteger(v) || v < min || v > max)
      errors.push(`${label} must be a whole number from ${min} to ${max}.`);
  }
  if (s.defaultMeetingLink && !isHttpUrl(s.defaultMeetingLink)) {
    errors.push('Default meeting link must start with http:// or https://.');
  }
  return errors;
}

export function lessonErrors(l: Pick<Lesson, 'title' | 'level' | 'summary' | 'content' | 'materialsUrl'>): string[] {
  const errors: string[] = [];
  if (l.title.trim() === '') errors.push('Title is required.');
  tooLong(errors, 'Title', l.title, 120);
  if (!isLevel(l.level)) errors.push('Choose a valid level.');
  tooLong(errors, 'Summary', l.summary, 500);
  tooLong(errors, 'Contents', l.content, 20_000);
  if (l.materialsUrl && !isHttpUrl(l.materialsUrl)) errors.push('Materials link must start with http:// or https://.');
  return errors;
}

/** Fields the teacher edits on a booking. */
export interface BookingDetails {
  lessonId: string | null;
  topic: string;
  meetingLink: string;
  materials: string;
  feedback: string;
  privateNote: string;
}

export function bookingDetailsErrors(d: BookingDetails): string[] {
  const errors: string[] = [];
  tooLong(errors, 'Topic', d.topic, 200);
  if (d.meetingLink && !isHttpUrl(d.meetingLink)) errors.push('Meeting link must start with http:// or https://.');
  tooLong(errors, 'Materials', d.materials, 2000);
  tooLong(errors, 'Feedback', d.feedback, 5000);
  tooLong(errors, 'Private note', d.privateNote, 5000);
  return errors;
}

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

/** Usernames are stored lowercase; no `@`, so a sign-in name is never mistaken for an email. */
export const normalizeUsername = (v: string): string => v.trim().toLowerCase();

export function usernameErrors(username: string): string[] {
  const u = normalizeUsername(username);
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return [`Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`];
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(u)) {
    return ['Username can use letters, numbers, dots, dashes and underscores, and must start with a letter or number.'];
  }
  return [];
}

export function passwordErrors(password: string, account: { username: string; email: string }): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN) errors.push(`Password must be at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) errors.push(`Password must be at most ${PASSWORD_MAX} characters.`);
  if (password.trim() === '') errors.push('Password cannot be only spaces.');
  const lower = password.toLowerCase();
  if (lower === normalizeUsername(account.username) || lower === account.email.toLowerCase()) {
    errors.push('Password must be different from your username and email.');
  }
  return errors;
}
