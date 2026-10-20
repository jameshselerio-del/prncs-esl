import type { IsoInstant } from './types';

/**
 * Teacher announcements: one message sent to chosen students by email and the bell.
 * The text may contain placeholders that are filled in per student.
 */

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 5000;
/** Most students one announcement can go to. */
export const ANNOUNCEMENT_MAX_RECIPIENTS = 500;

export const PLACEHOLDERS = [
  { token: '{first name}', label: 'First name', example: 'Yuki' },
  { token: '{name}', label: 'Full name', example: 'Yuki Tanaka' },
] as const;

/** A student's view: personalized for them. */
export interface Announcement {
  id: string;
  title: string;
  body: string;
  sentAt: IsoInstant;
}

/** The teacher's view: the original text (placeholders unfilled) and who received it. */
export interface SentAnnouncement extends Announcement {
  recipients: { email: string; name: string }[];
  emailed: boolean;
}

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? '';

/** Fills `{first name}` and `{name}` (any case, spaces optional) for one student. */
export function personalize(text: string, student: { name: string }): string {
  return text
    .replace(/\{\s*first\s*name\s*\}/gi, firstName(student.name))
    .replace(/\{\s*name\s*\}/gi, student.name.trim());
}

export function announcementErrors(a: { title: string; body: string; recipients: readonly string[] }): string[] {
  const errors: string[] = [];
  if (a.title.trim() === '') errors.push('Add a title.');
  if (a.title.length > ANNOUNCEMENT_TITLE_MAX) {
    errors.push(`The title must be at most ${ANNOUNCEMENT_TITLE_MAX} characters.`);
  }
  if (a.body.trim() === '') errors.push('Write a message.');
  if (a.body.length > ANNOUNCEMENT_BODY_MAX) {
    errors.push(`The message must be at most ${ANNOUNCEMENT_BODY_MAX} characters.`);
  }
  if (a.recipients.length === 0) errors.push('Choose at least one student.');
  if (a.recipients.length > ANNOUNCEMENT_MAX_RECIPIENTS) {
    errors.push(`An announcement can go to at most ${ANNOUNCEMENT_MAX_RECIPIENTS} students.`);
  }
  return errors;
}
