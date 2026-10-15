import { eachDate, rangesOverlap, weekdayOf } from './dates';
import type { Holiday, IsoDate, LeaveRequest, LeaveType, LedgerEntry, User } from './types';

export const ANNUAL_CREDITS = 5;

export const LEAVE_TYPES: LeaveType[] = ['VACATION', 'SICK', 'EMERGENCY', 'UNPAID', 'HOLIDAY'];

/** Types that deduct from the shared yearly credit pool. */
export const CREDIT_TYPES: ReadonlySet<LeaveType> = new Set(['VACATION', 'SICK', 'EMERGENCY']);

/** Types that may be filed for dates before today (e.g. sick leave reported after the fact). */
const BACKDATABLE_TYPES: ReadonlySet<LeaveType> = new Set(['SICK', 'EMERGENCY']);

export function allowedLeaveTypes(user: User): LeaveType[] {
  return user.status === 'REGULAR' ? LEAVE_TYPES : ['UNPAID', 'HOLIDAY'];
}

function officeHolidays(user: User, holidays: Holiday[]): Set<IsoDate> {
  return new Set(holidays.filter((h) => h.office === user.office).map((h) => h.date));
}

/**
 * Dates in the range that count as leave days for this user.
 * - HOLIDAY: only public holidays (of the user's office) that fall on the user's working days.
 * - Everything else: the user's working days, excluding public holidays.
 */
export function leaveDates(user: User, type: LeaveType, start: IsoDate, end: IsoDate, holidays: Holiday[]): IsoDate[] {
  const publicHolidays = officeHolidays(user, holidays);
  return eachDate(start, end).filter((date) => {
    if (!user.workingDays.includes(weekdayOf(date))) return false;
    return type === 'HOLIDAY' ? publicHolidays.has(date) : !publicHolidays.has(date);
  });
}

export function balanceFor(ledger: LedgerEntry[], email: string, year: number): number {
  return ledger.filter((e) => e.email === email && e.year === year).reduce((sum, e) => sum + e.delta, 0);
}

/** Credit days held by the user's pending requests that start in `year`. */
export function reservedCredits(requests: LeaveRequest[], email: string, year: number): number {
  return requests
    .filter(
      (r) =>
        r.email === email &&
        r.status === 'PENDING' &&
        CREDIT_TYPES.has(r.type) &&
        Number(r.startDate.slice(0, 4)) === year,
    )
    .reduce((sum, r) => sum + r.days, 0);
}

export interface NewRequestInput {
  user: User;
  type: LeaveType;
  startDate: IsoDate;
  endDate: IsoDate;
  today: IsoDate;
  holidays: Holiday[];
  /** The user's existing requests (any status). */
  existing: LeaveRequest[];
  /** Available credits (balance minus pending reservations) for the year of `startDate`. */
  balance: number;
}

export type ValidationResult = { ok: true; days: number } | { ok: false; errors: string[] };

export function validateNewRequest(input: NewRequestInput): ValidationResult {
  const { user, type, startDate, endDate, today, holidays, existing, balance } = input;
  const errors: string[] = [];

  if (!allowedLeaveTypes(user).includes(type)) {
    errors.push(`${type} leave is not available to ${user.status.toLowerCase()} employees.`);
  }
  if (startDate > endDate) {
    return { ok: false, errors: [...errors, 'Start date must be on or before end date.'] };
  }
  if (startDate < today && !BACKDATABLE_TYPES.has(type)) {
    errors.push(`${type} leave cannot be filed for past dates.`);
  }
  if (CREDIT_TYPES.has(type) && startDate.slice(0, 4) !== endDate.slice(0, 4)) {
    errors.push('A leave that uses credits cannot span two calendar years; file one request per year.');
  }

  const dates = leaveDates(user, type, startDate, endDate, holidays);
  if (dates.length === 0) {
    errors.push(
      type === 'HOLIDAY'
        ? 'No public holidays fall on your working days in this range.'
        : 'This range has no working days.',
    );
  }
  if (type === 'HOLIDAY' && dates.length > 0) {
    const workingDates = eachDate(startDate, endDate).filter((d) => user.workingDays.includes(weekdayOf(d)));
    if (workingDates.length !== dates.length) {
      errors.push('Holiday leave may only include public holidays.');
    }
  }

  const clash = existing.find(
    (r) =>
      (r.status === 'PENDING' || r.status === 'APPROVED') && rangesOverlap(r.startDate, r.endDate, startDate, endDate),
  );
  if (clash) {
    errors.push(`Overlaps an existing ${clash.status.toLowerCase()} request (${clash.startDate} to ${clash.endDate}).`);
  }

  if (CREDIT_TYPES.has(type) && dates.length > balance) {
    errors.push(`Not enough credits: needs ${dates.length}, ${balance} remaining.`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, days: dates.length };
}

/** Direct manager or HR/Admin, and never on one's own request. */
export function canDecide(approver: User, requester: User): boolean {
  if (approver.email === requester.email) return false;
  return approver.role === 'ADMIN' || requester.managerEmail === approver.email;
}

/** Requesters may cancel pending requests, and approved ones that have not started yet. */
export function canCancel(request: LeaveRequest, today: IsoDate): boolean {
  return request.status === 'PENDING' || (request.status === 'APPROVED' && request.startDate > today);
}
