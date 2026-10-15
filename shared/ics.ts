/** iCalendar (RFC 5545) invites attached to booking emails. Pure, so it is unit-tested here. */

export interface ClassEvent {
  /** Stable per booking, so a cancellation replaces the original event. */
  uid: string;
  start: string;
  end: string;
  summary: string;
  description: string;
  /** Meeting link, shown as the event location and URL. */
  url: string;
  organizer: { name: string; email: string } | null;
  attendee: { name: string; email: string } | null;
  /**
   * REQUEST: an invitation the recipient can add (student copy).
   * PUBLISH: a plain event to add (teacher copy, since the teacher is the organizer).
   * CANCEL: removes a previously sent REQUEST.
   */
  method: 'REQUEST' | 'PUBLISH' | 'CANCEL';
  /** 0 for the original invite; higher for updates such as a cancellation. */
  sequence: number;
}

/** `20261026T010000Z` */
const icsTime = (iso: string): string =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Escapes TEXT values: backslash, semicolon, comma and newlines. */
const escapeText = (v: string): string =>
  v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Escapes a quoted parameter value such as CN (quotes are not allowed inside). */
const escapeParam = (v: string): string => `"${v.replace(/"/g, "'")}"`;

/** UTF-8 byte length of one code point (Apps Script has no TextEncoder). */
function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/** Folds lines longer than 75 octets (UTF-8) with CRLF + space, never splitting a character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = utf8Length(ch);
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function buildIcs(e: ClassEvent, stamp: Date): string {
  const cancelled = e.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//prncs-esl//Class booking//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.method}`,
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsTime(stamp.toISOString())}`,
    `DTSTART:${icsTime(e.start)}`,
    `DTEND:${icsTime(e.end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    ...(e.url ? [`LOCATION:${escapeText(e.url)}`, `URL:${e.url}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${escapeParam(e.organizer.name)}:mailto:${e.organizer.email}`] : []),
    ...(e.attendee
      ? [
          `ATTENDEE;CN=${escapeParam(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${e.attendee.email}`,
        ]
      : []),
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(cancelled
      ? []
      : ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:English class', 'TRIGGER:-PT15M', 'END:VALARM']),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
