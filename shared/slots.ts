import { eachDate, weekdayOf } from './dates';
import { DAY_MS, HOUR_MS, MINUTE_MS, parseClock, teacherDateOf, teacherWallToUtc } from './time';
import type { AvailabilityRule, Booking, IsoInstant, Settings, Slot, TimeOff } from './types';

export const DEFAULT_SETTINGS: Settings = {
  schoolName: 'ESL Classes',
  lessonMinutes: 50,
  slotStepMinutes: 30,
  minNoticeHours: 12,
  bookingWindowDays: 30,
  cancelNoticeHours: 24,
  maxUpcomingPerStudent: 5,
  defaultMeetingLink: '',
};

export interface ScheduleContext {
  rules: AvailabilityRule[];
  timeOff: TimeOff[];
  bookings: Booking[];
  settings: Settings;
  now: Date;
}

/** Cancelled bookings free their time; every other status occupies it. */
const occupies = (b: Booking): boolean => b.status !== 'CANCELLED';

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

/** Every bookable slot from now (plus minimum notice) to the end of the booking window, sorted by start. */
export function generateSlots({ rules, timeOff, bookings, settings, now }: ScheduleContext): Slot[] {
  const lengthMs = settings.lessonMinutes * MINUTE_MS;
  const earliest = now.getTime() + settings.minNoticeHours * HOUR_MS;
  const latest = now.getTime() + settings.bookingWindowDays * DAY_MS;

  const daysOff = new Set<string>();
  for (const t of timeOff) {
    if (t.startDate <= t.endDate) eachDate(t.startDate, t.endDate).forEach((d) => daysOff.add(d));
  }
  const taken = bookings.filter(occupies).map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);

  // Overlapping rules could yield the same start twice; key by start time.
  const slots = new Map<number, Slot>();
  const firstDate = teacherDateOf(now);
  const lastDate = teacherDateOf(new Date(latest));
  for (const date of eachDate(firstDate, lastDate)) {
    if (daysOff.has(date)) continue;
    const weekday = weekdayOf(date);
    for (const rule of rules) {
      if (rule.weekday !== weekday) continue;
      const from = parseClock(rule.start);
      const to = parseClock(rule.end);
      if (from === null || to === null) continue;
      for (let m = from; m + settings.lessonMinutes <= to; m += settings.slotStepMinutes) {
        const start = teacherWallToUtc(date, m).getTime();
        const end = start + lengthMs;
        if (start < earliest || start > latest) continue;
        if (taken.some(([s, e]) => overlaps(start, end, s, e))) continue;
        slots.set(start, { start: new Date(start).toISOString(), end: new Date(end).toISOString() });
      }
    }
  }
  return [...slots.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export function upcomingCount(bookings: Booking[], email: string, now: Date): number {
  return bookings.filter(
    (b) => b.studentEmail === email && b.status === 'CONFIRMED' && Date.parse(b.end) > now.getTime(),
  ).length;
}

/** Why `start` can't be booked by `email`, or an empty list when it can. Returns the slot when bookable. */
export function checkNewBooking(
  ctx: ScheduleContext,
  email: string,
  start: IsoInstant,
): { slot: Slot; errors: [] } | { slot: null; errors: string[] } {
  const errors: string[] = [];
  if (upcomingCount(ctx.bookings, email, ctx.now) >= ctx.settings.maxUpcomingPerStudent) {
    errors.push(
      `You already have ${ctx.settings.maxUpcomingPerStudent} upcoming classes, the most you can hold at once.`,
    );
  }
  const slot = generateSlots(ctx).find((s) => s.start === start);
  if (!slot) errors.push('That time is no longer available. Please pick another slot.');
  return slot && errors.length === 0 ? { slot, errors: [] } : { slot: null, errors };
}

/** The fields the cancel/outcome rules need, so student views (without private notes) qualify. */
type Timed = Pick<Booking, 'status' | 'start'>;

/** Students may cancel their confirmed classes up to the cancel notice before the start. */
export function canStudentCancel(b: Timed, now: Date, settings: Settings): boolean {
  return b.status === 'CONFIRMED' && Date.parse(b.start) - now.getTime() >= settings.cancelNoticeHours * HOUR_MS;
}

/** The teacher may cancel any confirmed class that has not started. */
export function canTeacherCancel(b: Timed, now: Date): boolean {
  return b.status === 'CONFIRMED' && Date.parse(b.start) > now.getTime();
}

/** Completed / no-show can be recorded once a class has started (and changed between the two). */
export function canRecordOutcome(b: Timed, now: Date): boolean {
  return b.status !== 'CANCELLED' && Date.parse(b.start) <= now.getTime();
}
