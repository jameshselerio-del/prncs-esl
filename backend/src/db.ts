import { DEFAULT_SETTINGS } from '../../shared/slots';
import type {
  AvailabilityRule,
  Booking,
  BookingStatus,
  Lesson,
  Level,
  Role,
  Settings,
  TimeOff,
  User,
  Weekday,
} from '../../shared/types';
import { getConfig } from './config';
import { ApiError } from './errors';

/** Column order of every tab. The header row in the Sheet must match. */
export const SCHEMA = {
  Users: ['email', 'name', 'role', 'active', 'timeZone', 'level', 'nativeLanguage', 'goals', 'contact', 'createdAt'],
  Availability: ['id', 'weekday', 'start', 'end'],
  TimeOff: ['id', 'startDate', 'endDate', 'note'],
  Bookings: [
    'id',
    'studentEmail',
    'start',
    'end',
    'status',
    'lessonId',
    'topic',
    'studentNote',
    'meetingLink',
    'materials',
    'feedback',
    'privateNote',
    'createdAt',
    'cancelledAt',
    'cancelledBy',
    'cancelReason',
    'reminderSentAt',
  ],
  Lessons: ['id', 'title', 'level', 'summary', 'content', 'materialsUrl', 'createdAt'],
  Settings: ['key', 'value'],
  /** Password sign-in, kept apart from Users so hashes never reach any user-facing response. */
  Logins: ['email', 'username', 'passwordHash', 'updatedAt'],
} as const;

export type Table = keyof typeof SCHEMA;

/** A username/password for an existing user. Server-only: never return it from a handler. */
export interface Login {
  email: string;
  /** Lowercase. */
  username: string;
  /** `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>` (see passwords.ts). */
  passwordHash: string;
  updatedAt: string;
}
type Row = Record<string, string>;

let spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

function sheet(table: Table): GoogleAppsScript.Spreadsheet.Sheet {
  spreadsheet ??= SpreadsheetApp.openById(getConfig('SPREADSHEET_ID'));
  const found = spreadsheet.getSheetByName(table);
  if (!found) {
    throw new ApiError(
      `The database is missing the "${table}" tab. The teacher needs to run setupDatabase in the Apps Script editor.`,
    );
  }
  return found;
}

function readRows(table: Table): Row[] {
  // Display values keep everything as text, so dates never get time-zone shifted.
  const [header, ...rows] = sheet(table).getDataRange().getDisplayValues();
  return rows
    .filter((r) => r.some((cell) => cell !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function appendRow(table: Table, row: Row): void {
  sheet(table).appendRow(SCHEMA[table].map((col) => row[col] ?? ''));
}

/** Overwrites the row whose `keyColumn` equals `key` (case-insensitive) with `row`, keeping unspecified cells. */
function updateRow(table: Table, keyColumn: string, key: string, row: Row): void {
  const s = sheet(table);
  const values = s.getDataRange().getDisplayValues();
  const header = values[0];
  const keyIndex = header.indexOf(keyColumn);
  const rowIndex = values.findIndex((r, i) => i > 0 && r[keyIndex].trim().toLowerCase() === key.toLowerCase());
  if (rowIndex < 0) throw new Error(`${table} row not found: ${key}`);
  const updated = header.map((h, i) => (h in row ? row[h] : values[rowIndex][i]));
  s.getRange(rowIndex + 1, 1, 1, header.length).setValues([updated]);
}

function deleteRow(table: Table, keyColumn: string, key: string): void {
  const s = sheet(table);
  const values = s.getDataRange().getDisplayValues();
  const keyIndex = values[0].indexOf(keyColumn);
  const rowIndex = values.findIndex((r, i) => i > 0 && r[keyIndex] === key);
  if (rowIndex >= 0) s.deleteRow(rowIndex + 1);
}

/** Replaces all data rows of a small table in one write (trailing old rows are blanked). */
function replaceRows(table: Table, rows: Row[]): void {
  const s = sheet(table);
  const columns = SCHEMA[table];
  const values = rows.map((r) => columns.map((c) => r[c] ?? ''));
  const height = Math.max(values.length, s.getLastRow() - 1);
  while (values.length < height) values.push(columns.map(() => ''));
  if (height > 0) s.getRange(2, 1, height, columns.length).setValues(values);
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const toRow = (o: object): Row => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, str(v)]));
const nullable = (v: string): string | null => (v === '' ? null : v);

function toUser(r: Row): User {
  return {
    email: r.email.trim().toLowerCase(),
    name: r.name,
    role: (r.role.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'STUDENT') as Role,
    active: r.active.toUpperCase() !== 'FALSE',
    timeZone: r.timeZone || 'Asia/Manila',
    level: r.level as Level | '',
    nativeLanguage: r.nativeLanguage,
    goals: r.goals,
    contact: r.contact,
    createdAt: r.createdAt,
  };
}

const userToRow = (u: User): Row => ({ ...toRow(u), active: u.active ? 'TRUE' : 'FALSE' });

function toBooking(r: Row): Booking {
  return {
    id: r.id,
    studentEmail: r.studentEmail.trim().toLowerCase(),
    start: r.start,
    end: r.end,
    status: r.status as BookingStatus,
    lessonId: nullable(r.lessonId),
    topic: r.topic,
    studentNote: r.studentNote,
    meetingLink: r.meetingLink,
    materials: r.materials,
    feedback: r.feedback,
    privateNote: r.privateNote,
    createdAt: r.createdAt,
    cancelledAt: nullable(r.cancelledAt),
    cancelledBy: nullable(r.cancelledBy),
    cancelReason: r.cancelReason,
    reminderSentAt: nullable(r.reminderSentAt),
  };
}

function toLesson(r: Row): Lesson {
  return {
    id: r.id,
    title: r.title,
    level: r.level as Level | '',
    summary: r.summary,
    content: r.content,
    materialsUrl: r.materialsUrl,
    createdAt: r.createdAt,
  };
}

function readSettings(): Settings {
  const stored = Object.fromEntries(readRows('Settings').map((r) => [r.key, r.value]));
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = stored[key];
    if (value === undefined || value === '') continue;
    if (typeof DEFAULT_SETTINGS[key] === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) (settings[key] as number) = n;
    } else {
      (settings[key] as string) = value;
    }
  }
  return settings;
}

export const db = {
  users: (): User[] => readRows('Users').map(toUser),
  insertUser: (u: User): void => appendRow('Users', userToRow(u)),
  updateUser: (u: User): void => updateRow('Users', 'email', u.email, userToRow(u)),

  bookings: (): Booking[] => readRows('Bookings').map(toBooking),
  insertBooking: (b: Booking): void => appendRow('Bookings', toRow(b)),
  updateBooking: (b: Booking): void => updateRow('Bookings', 'id', b.id, toRow(b)),

  rules: (): AvailabilityRule[] =>
    readRows('Availability').map((r) => ({
      id: r.id,
      weekday: Number(r.weekday) as Weekday,
      start: r.start,
      end: r.end,
    })),
  replaceRules: (rules: AvailabilityRule[]): void => replaceRows('Availability', rules.map(toRow)),

  timeOff: (): TimeOff[] =>
    readRows('TimeOff').map((r) => ({ id: r.id, startDate: r.startDate, endDate: r.endDate, note: r.note })),
  insertTimeOff: (t: TimeOff): void => appendRow('TimeOff', toRow(t)),
  deleteTimeOff: (id: string): void => deleteRow('TimeOff', 'id', id),

  lessons: (): Lesson[] => readRows('Lessons').map(toLesson),
  insertLesson: (l: Lesson): void => appendRow('Lessons', toRow(l)),
  updateLesson: (l: Lesson): void => updateRow('Lessons', 'id', l.id, toRow(l)),
  deleteLesson: (id: string): void => deleteRow('Lessons', 'id', id),

  logins: (): Login[] =>
    readRows('Logins').map((r) => ({
      email: r.email.trim().toLowerCase(),
      username: r.username.trim().toLowerCase(),
      passwordHash: r.passwordHash,
      updatedAt: r.updatedAt,
    })),
  insertLogin: (l: Login): void => appendRow('Logins', toRow(l)),
  updateLogin: (l: Login): void => updateRow('Logins', 'email', l.email, toRow(l)),

  settings: readSettings,
  saveSettings: (s: Settings): void =>
    replaceRows(
      'Settings',
      Object.entries(s).map(([key, value]) => ({ key, value: str(value) })),
    ),
};
