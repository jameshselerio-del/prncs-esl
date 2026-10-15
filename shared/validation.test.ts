import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './slots';
import {
  availabilityErrors,
  bookingDetailsErrors,
  isTimeZone,
  lessonErrors,
  profileErrors,
  settingsErrors,
  timeOffErrors,
} from './validation';

describe('profileErrors', () => {
  const profile = {
    name: 'Ana',
    timeZone: 'Asia/Tokyo',
    level: '' as const,
    nativeLanguage: '',
    goals: '',
    contact: '',
  };
  it('accepts a minimal profile', () => {
    expect(profileErrors(profile)).toEqual([]);
  });
  it('requires a name and a valid time zone', () => {
    expect(profileErrors({ ...profile, name: ' ', timeZone: 'Tokyo time' })).toHaveLength(2);
  });
  it('recognises IANA zone names', () => {
    expect(['UTC', 'Asia/Manila', 'America/Argentina/Buenos_Aires', 'Etc/GMT+8'].every(isTimeZone)).toBe(true);
    expect(isTimeZone('<script>')).toBe(false);
  });
});

describe('availabilityErrors', () => {
  it('accepts separate ranges on the same day', () => {
    expect(
      availabilityErrors([
        { id: 'a', weekday: 1, start: '09:00', end: '12:00' },
        { id: 'b', weekday: 1, start: '13:00', end: '24:00' },
      ]),
    ).toEqual([]);
  });
  it('rejects bad times, reversed ranges and overlaps', () => {
    expect(availabilityErrors([{ id: 'a', weekday: 2, start: '9am', end: '12:00' }])).toHaveLength(1);
    expect(availabilityErrors([{ id: 'a', weekday: 2, start: '12:00', end: '09:00' }])).toHaveLength(1);
    expect(
      availabilityErrors([
        { id: 'a', weekday: 3, start: '09:00', end: '12:00' },
        { id: 'b', weekday: 3, start: '11:00', end: '13:00' },
      ]),
    ).toEqual(['Wednesday: time ranges overlap.']);
  });
});

describe('timeOffErrors', () => {
  it('validates dates and order', () => {
    expect(timeOffErrors({ startDate: '2026-12-24', endDate: '2026-12-26', note: 'Christmas' })).toEqual([]);
    expect(timeOffErrors({ startDate: '2026-12-26', endDate: '2026-12-24', note: '' })).toHaveLength(1);
    expect(timeOffErrors({ startDate: '2026-02-30', endDate: '2026-03-01', note: '' })).toHaveLength(1);
  });
});

describe('settingsErrors', () => {
  it('accepts the defaults and rejects out-of-range values', () => {
    expect(settingsErrors(DEFAULT_SETTINGS)).toEqual([]);
    expect(settingsErrors({ ...DEFAULT_SETTINGS, lessonMinutes: 10, bookingWindowDays: 1.5 })).toHaveLength(2);
    expect(settingsErrors({ ...DEFAULT_SETTINGS, defaultMeetingLink: 'zoom.us/j/1' })).toHaveLength(1);
  });
});

describe('lesson and booking details', () => {
  it('validates lessons', () => {
    const lesson = { title: 'Small talk', level: 'BEGINNER' as const, summary: '', content: '', materialsUrl: '' };
    expect(lessonErrors(lesson)).toEqual([]);
    expect(lessonErrors({ ...lesson, title: '', materialsUrl: 'ftp://x' })).toHaveLength(2);
  });
  it('validates meeting links', () => {
    const details = {
      lessonId: null,
      topic: '',
      meetingLink: 'https://meet.google.com/abc',
      materials: '',
      feedback: '',
      privateNote: '',
    };
    expect(bookingDetailsErrors(details)).toEqual([]);
    expect(bookingDetailsErrors({ ...details, meetingLink: 'javascript:alert(1)' })).toHaveLength(1);
  });
});
