import { describe, expect, it } from 'vitest';
import {
  canRecordOutcome,
  canStudentCancel,
  canTeacherCancel,
  checkNewBooking,
  DEFAULT_SETTINGS,
  generateSlots,
  type ScheduleContext,
} from './slots';
import { formatClock, parseClock, teacherDateOf, teacherWallToUtc } from './time';
import type { Booking } from './types';

// 2026-10-19 is a Monday; 00:00Z is 08:00 in Manila.
const NOW = new Date('2026-10-19T00:00:00Z');

const ctx = (overrides: Partial<ScheduleContext> = {}): ScheduleContext => ({
  rules: [{ id: 'r1', weekday: 1, start: '09:00', end: '12:00' }],
  timeOff: [],
  bookings: [],
  settings: DEFAULT_SETTINGS,
  now: NOW,
  ...overrides,
});

const booking = (overrides: Partial<Booking>): Booking => ({
  id: 'b1',
  studentEmail: 'ana@example.com',
  start: '2026-10-26T01:30:00.000Z',
  end: '2026-10-26T02:20:00.000Z',
  status: 'CONFIRMED',
  lessonId: null,
  topic: '',
  studentNote: '',
  meetingLink: '',
  materials: '',
  feedback: '',
  privateNote: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: '',
  reminderSentAt: null,
  ...overrides,
});

const startsOn = (slots: { start: string }[], day: string) =>
  slots.filter((s) => s.start.startsWith(day)).map((s) => s.start.slice(11, 16));

describe('time', () => {
  it('parses and formats clock times', () => {
    expect(parseClock('09:30')).toBe(570);
    expect(parseClock('24:00')).toBe(1440);
    expect(parseClock('24:30')).toBeNull();
    expect(parseClock('9:30')).toBeNull();
    expect(formatClock(570)).toBe('09:30');
  });
  it('converts Manila wall time to UTC and back', () => {
    expect(teacherWallToUtc('2026-10-19', 9 * 60).toISOString()).toBe('2026-10-19T01:00:00.000Z');
    expect(teacherWallToUtc('2026-10-19', 2 * 60).toISOString()).toBe('2026-10-18T18:00:00.000Z');
    expect(teacherDateOf(new Date('2026-10-19T17:00:00Z'))).toBe('2026-10-20');
  });
});

describe('generateSlots', () => {
  it('fits lessons inside availability, honours min notice and the booking window', () => {
    const slots = generateSlots(ctx());
    // Today's Monday slots are inside the 12h notice; 4 Mondays remain in the 30-day window, 5 slots each.
    expect(slots).toHaveLength(20);
    expect(startsOn(slots, '2026-10-26')).toEqual(['01:00', '01:30', '02:00', '02:30', '03:00']);
    expect(slots[0]).toEqual({ start: '2026-10-26T01:00:00.000Z', end: '2026-10-26T01:50:00.000Z' });
  });
  it('includes same-day slots when notice allows', () => {
    const slots = generateSlots(ctx({ settings: { ...DEFAULT_SETTINGS, minNoticeHours: 0 } }));
    expect(startsOn(slots, '2026-10-19')).toHaveLength(5);
  });
  it('removes slots overlapping active bookings but not cancelled ones', () => {
    expect(startsOn(generateSlots(ctx({ bookings: [booking({})] })), '2026-10-26')).toEqual(['02:30', '03:00']);
    expect(startsOn(generateSlots(ctx({ bookings: [booking({ status: 'CANCELLED' })] })), '2026-10-26')).toHaveLength(
      5,
    );
  });
  it('skips time-off days', () => {
    const slots = generateSlots(
      ctx({ timeOff: [{ id: 't', startDate: '2026-10-26', endDate: '2026-11-02', note: '' }] }),
    );
    expect(startsOn(slots, '2026-10-26')).toEqual([]);
    expect(startsOn(slots, '2026-11-02')).toEqual([]);
    expect(slots).toHaveLength(10);
  });
  it('does not duplicate slots from overlapping rules', () => {
    const rules = [
      { id: 'a', weekday: 1 as const, start: '09:00', end: '12:00' },
      { id: 'b', weekday: 1 as const, start: '10:00', end: '11:00' },
    ];
    expect(generateSlots(ctx({ rules }))).toHaveLength(20);
  });
});

describe('checkNewBooking', () => {
  it('accepts an open slot', () => {
    expect(checkNewBooking(ctx(), 'ana@example.com', '2026-10-26T01:00:00.000Z').errors).toEqual([]);
  });
  it('rejects taken or unknown times', () => {
    expect(
      checkNewBooking(ctx({ bookings: [booking({})] }), 'ken@example.com', '2026-10-26T01:00:00.000Z').slot,
    ).toBeNull();
    expect(checkNewBooking(ctx(), 'ana@example.com', '2026-10-26T01:10:00.000Z').slot).toBeNull();
  });
  it('enforces the max upcoming bookings per student', () => {
    const settings = { ...DEFAULT_SETTINGS, maxUpcomingPerStudent: 1 };
    const result = checkNewBooking(
      ctx({ settings, bookings: [booking({})] }),
      'ana@example.com',
      '2026-11-02T01:00:00.000Z',
    );
    expect(result.errors[0]).toContain('upcoming classes');
  });
});

describe('cancellation and outcomes', () => {
  const b = booking({ start: '2026-10-20T00:00:00.000Z', end: '2026-10-20T00:50:00.000Z' });
  it('lets students cancel only before the cancel notice', () => {
    expect(canStudentCancel(b, new Date('2026-10-19T00:00:00Z'), DEFAULT_SETTINGS)).toBe(true);
    expect(canStudentCancel(b, new Date('2026-10-19T00:00:01Z'), DEFAULT_SETTINGS)).toBe(false);
    expect(canStudentCancel({ ...b, status: 'CANCELLED' }, NOW, DEFAULT_SETTINGS)).toBe(false);
  });
  it('lets the teacher cancel until the class starts, then record an outcome', () => {
    const during = new Date('2026-10-20T00:10:00Z');
    expect(canTeacherCancel(b, NOW)).toBe(true);
    expect(canTeacherCancel(b, during)).toBe(false);
    expect(canRecordOutcome(b, NOW)).toBe(false);
    expect(canRecordOutcome(b, during)).toBe(true);
    expect(canRecordOutcome({ ...b, status: 'CANCELLED' }, during)).toBe(false);
  });
});
