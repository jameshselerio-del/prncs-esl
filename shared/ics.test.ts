import { describe, expect, it } from 'vitest';
import { buildIcs, type ClassEvent } from './ics';

const event: ClassEvent = {
  uid: 'b1@prncs-esl',
  start: '2026-10-26T01:00:00.000Z',
  end: '2026-10-26T01:50:00.000Z',
  summary: "Teacher Maria's English: class",
  description: 'Topic: travel; phrases, part 2\nJoin: https://meet.google.com/abc',
  url: 'https://meet.google.com/abc',
  organizer: { name: 'Maria "Teacher" Santos', email: 'teacher@example.com' },
  attendee: { name: 'Yuki', email: 'yuki@example.com' },
  method: 'REQUEST',
  sequence: 0,
};
const STAMP = new Date('2026-10-20T00:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('buildIcs', () => {
  it('builds a REQUEST invite with UTC times, organizer, attendee and an alarm', () => {
    const ics = unfold(buildIcs(event, STAMP));
    expect(ics).toContain('METHOD:REQUEST\r\n');
    expect(ics).toContain('UID:b1@prncs-esl\r\n');
    expect(ics).toContain('DTSTART:20261026T010000Z\r\n');
    expect(ics).toContain('DTEND:20261026T015000Z\r\n');
    expect(ics).toContain('DTSTAMP:20261020T000000Z\r\n');
    expect(ics).toContain('ORGANIZER;CN="Maria \'Teacher\' Santos":mailto:teacher@example.com\r\n');
    expect(ics).toContain('mailto:yuki@example.com\r\n');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('escapes text values', () => {
    const ics = unfold(buildIcs(event, STAMP));
    expect(ics).toContain("SUMMARY:Teacher Maria's English: class\r\n");
    expect(ics).toContain('DESCRIPTION:Topic: travel\\; phrases\\, part 2\\nJoin: https://meet.google.com/abc\r\n');
  });

  it('folds long lines to 75 octets without splitting characters', () => {
    const ics = buildIcs({ ...event, description: 'ありがとう'.repeat(40) }, STAMP);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(unfold(ics)).toContain(`DESCRIPTION:${'ありがとう'.repeat(40)}\r\n`);
  });

  it('builds a cancellation that replaces the original event', () => {
    const ics = unfold(buildIcs({ ...event, method: 'CANCEL', sequence: 1 }, STAMP));
    expect(ics).toContain('METHOD:CANCEL');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics).toContain('UID:b1@prncs-esl');
    expect(ics).not.toContain('VALARM');
  });

  it('omits location, organizer and attendee when absent', () => {
    const ics = buildIcs({ ...event, url: '', organizer: null, attendee: null, method: 'PUBLISH' }, STAMP);
    expect(ics).not.toMatch(/LOCATION|URL:|ORGANIZER|ATTENDEE/);
  });
});
