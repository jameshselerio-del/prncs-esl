/** Display helpers. All booking times are UTC instants; they are shown in the viewer's time zone. */

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const FALLBACK_ZONES = [
  'UTC',
  'Asia/Manila',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Singapore',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
];

export function timeZoneOptions(current: string): string[] {
  let zones: string[];
  try {
    zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    zones = FALLBACK_ZONES;
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

function format(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, ...options }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
  }
}

export const fmtTime = (iso: string, tz: string) => format(iso, tz, { hour: 'numeric', minute: '2-digit' });
export const fmtDate = (iso: string, tz: string) =>
  format(iso, tz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtDayHeading = (iso: string, tz: string) =>
  format(iso, tz, { weekday: 'long', month: 'long', day: 'numeric' });
export const fmtMonth = (year: number, month: number) =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month, 1)),
  );
export const fmtRange = (start: string, end: string, tz: string) =>
  `${fmtDate(start, tz)}, ${fmtTime(start, tz)} – ${fmtTime(end, tz)}`;

/** The viewer-local calendar date (`YYYY-MM-DD`) of an instant. */
export function localDateKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "in 3 days", "in 2 hours", "5 minutes ago"… */
export function relative(iso: string, now: number): string {
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}
