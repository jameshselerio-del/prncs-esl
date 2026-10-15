import { parseIsoDate } from './dates';
import type { EmploymentStatus, Office, Role, User, Weekday } from './types';

export const OFFICES: Office[] = ['PH', 'JP'];
export const ROLES: Role[] = ['EMPLOYEE', 'MANAGER', 'ADMIN'];
export const STATUSES: EmploymentStatus[] = ['PROBATIONARY', 'REGULAR'];
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Column order shared by the Users sheet tab and the CSV import template. */
export const USER_COLUMNS = [
  'email',
  'name',
  'office',
  'role',
  'managerEmail',
  'status',
  'regularizedOn',
  'workingDays',
  'active',
] as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

function parseWeekday(token: string): Weekday | null {
  if (/^[0-6]$/.test(token)) return Number(token) as Weekday;
  const index = WEEKDAY_NAMES.findIndex((n) => n.toLowerCase() === token.slice(0, 3).toLowerCase());
  return token.length >= 3 && index >= 0 ? (index as Weekday) : null;
}

/**
 * Parses working days such as `1,2,3,4,5`, `1;2;3`, `Mon-Fri` or `Mon,Wed,Fri`
 * (0 = Sunday … 6 = Saturday). Returns null when any part is not a weekday.
 */
export function parseWorkingDays(text: string): Weekday[] | null {
  const days = new Set<Weekday>();
  for (const token of text.split(/[\s,;|]+/).filter(Boolean)) {
    const [from, to, ...rest] = token.split('-');
    const start = parseWeekday(from);
    const end = to === undefined ? start : parseWeekday(to);
    if (start === null || end === null || rest.length > 0 || end < start) return null;
    for (let d = start; d <= end; d++) days.add(d as Weekday);
  }
  return [...days].sort((a, b) => a - b);
}

export const formatWorkingDays = (days: Weekday[]): string => [...days].sort((a, b) => a - b).join(',');

/** Errors in a single user's own fields. */
export function userFieldErrors(user: User): string[] {
  const errors: string[] = [];
  if (!EMAIL.test(user.email)) errors.push('Email is not valid.');
  if (user.name.trim() === '') errors.push('Name is required.');
  if (!OFFICES.includes(user.office)) errors.push(`Office must be one of ${OFFICES.join(', ')}.`);
  if (!ROLES.includes(user.role)) errors.push(`Role must be one of ${ROLES.join(', ')}.`);
  if (!STATUSES.includes(user.status)) errors.push(`Status must be one of ${STATUSES.join(', ')}.`);
  if (user.status === 'REGULAR' && !user.regularizedOn)
    errors.push('Regularized date is required for regular employees.');
  if (user.regularizedOn) {
    try {
      parseIsoDate(user.regularizedOn);
    } catch {
      errors.push('Regularized date must be YYYY-MM-DD.');
    }
  }
  if (user.workingDays.length === 0) errors.push('At least one working day is required.');
  if (user.managerEmail === user.email) errors.push('A user cannot be their own manager.');
  return errors;
}

/**
 * Validates `users` as a whole directory and returns the errors for the emails in `check`.
 * Covers field errors, duplicate emails, unknown or non-manager managers, and reporting cycles.
 */
export function validateDirectory(users: User[], check: Iterable<string>): Map<string, string[]> {
  const byEmail = new Map<string, User>();
  const duplicates = new Set<string>();
  for (const u of users) {
    if (byEmail.has(u.email)) duplicates.add(u.email);
    byEmail.set(u.email, u);
  }

  const result = new Map<string, string[]>();
  for (const email of new Set(check)) {
    const user = byEmail.get(email);
    if (!user) continue;
    const errors = userFieldErrors(user);
    if (duplicates.has(email)) errors.push('Email appears more than once.');

    if (user.managerEmail && user.managerEmail !== user.email) {
      const manager = byEmail.get(user.managerEmail);
      if (!manager) {
        errors.push(`Manager ${user.managerEmail} is not a user.`);
      } else if (manager.role === 'EMPLOYEE') {
        errors.push(`Manager ${user.managerEmail} must have the MANAGER or ADMIN role.`);
      }
    }

    // Walk up the reporting line; revisiting someone means a cycle.
    const seen = new Set([email]);
    for (let m = user.managerEmail; m && byEmail.has(m); m = byEmail.get(m)!.managerEmail) {
      if (seen.has(m)) {
        errors.push('Reporting line forms a cycle.');
        break;
      }
      seen.add(m);
    }

    if (errors.length) result.set(email, errors);
  }
  return result;
}

/** Converts a loosely formatted record (sheet row or CSV line) into a User plus any parse errors. */
export function userFromRecord(record: Partial<Record<(typeof USER_COLUMNS)[number], string>>): {
  user: User;
  errors: string[];
} {
  const get = (key: (typeof USER_COLUMNS)[number]) => (record[key] ?? '').trim();
  const errors: string[] = [];

  const workingDaysText = get('workingDays');
  const workingDays = parseWorkingDays(workingDaysText);
  if (workingDays === null)
    errors.push(`Working days "${workingDaysText}" are not valid (use e.g. 1,2,3,4,5 or Mon-Fri).`);

  const activeText = get('active').toUpperCase();
  if (!['', 'TRUE', 'FALSE', 'YES', 'NO', '1', '0'].includes(activeText)) {
    errors.push('Active must be TRUE or FALSE.');
  }

  const user: User = {
    email: normalizeEmail(get('email')),
    name: get('name'),
    office: get('office').toUpperCase() as Office,
    role: get('role').toUpperCase() as Role,
    managerEmail: normalizeEmail(get('managerEmail')) || null,
    status: get('status').toUpperCase() as EmploymentStatus,
    regularizedOn: get('regularizedOn') || null,
    workingDays: workingDays ?? [],
    // Blank means active, so new hires don't need the column filled in.
    active: !['FALSE', 'NO', '0'].includes(activeText),
  };
  return { user, errors };
}
