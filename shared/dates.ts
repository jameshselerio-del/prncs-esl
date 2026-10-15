import type { IsoDate, Weekday } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses `YYYY-MM-DD` as a UTC date so results never depend on the server or browser time zone. */
export function parseIsoDate(value: IsoDate): Date {
  if (!ISO_DATE.test(value)) throw new Error(`Invalid date: ${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(value: IsoDate): Weekday {
  return parseIsoDate(value).getUTCDay() as Weekday;
}

/** Every date from `start` to `end`, inclusive. */
export function eachDate(start: IsoDate, end: IsoDate): IsoDate[] {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end);
  if (from > to) throw new Error('Start date is after end date');
  const dates: IsoDate[] = [];
  for (let d = from; d <= to; d = new Date(d.getTime() + 86_400_000)) {
    dates.push(toIsoDate(d));
  }
  return dates;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIsoDate(value).getTime() + days * 86_400_000));
}
