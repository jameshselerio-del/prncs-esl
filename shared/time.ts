import { parseIsoDate, toIsoDate } from './dates';
import type { ClockTime, IsoDate } from './types';

/**
 * The teacher's availability is defined in Manila time. The Philippines has no
 * daylight saving time, so the UTC offset is constant.
 */
export const TEACHER_TIME_ZONE = 'Asia/Manila';
export const TEACHER_UTC_OFFSET_MINUTES = 8 * 60;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const CLOCK = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

/** Minutes after midnight for `HH:MM`, or null if malformed. `24:00` = 1440 (end of day). */
export function parseClock(value: ClockTime): number | null {
  const match = CLOCK.exec(value);
  if (!match) return null;
  return match[1] === undefined ? 24 * 60 : Number(match[1]) * 60 + Number(match[2]);
}

export function formatClock(minutes: number): ClockTime {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The UTC instant of a Manila wall-clock time (`minutes` after midnight on `date`). */
export function teacherWallToUtc(date: IsoDate, minutes: number): Date {
  return new Date(parseIsoDate(date).getTime() + (minutes - TEACHER_UTC_OFFSET_MINUTES) * MINUTE_MS);
}

/** The Manila calendar date of an instant. */
export function teacherDateOf(instant: Date): IsoDate {
  return toIsoDate(new Date(instant.getTime() + TEACHER_UTC_OFFSET_MINUTES * MINUTE_MS));
}
