import { getConfig } from './config';
import type {
  EmploymentStatus,
  Holiday,
  LeaveRequest,
  LeaveType,
  LedgerEntry,
  LedgerKind,
  Office,
  RequestStatus,
  Role,
  User,
  Weekday,
} from '../../shared/types';

/** Column order of every tab. The header row in the Sheet must match. */
export const SCHEMA = {
  Users: ['email', 'name', 'office', 'role', 'managerEmail', 'status', 'regularizedOn', 'workingDays', 'active'],
  Requests: [
    'id',
    'email',
    'type',
    'startDate',
    'endDate',
    'days',
    'reason',
    'status',
    'approverEmail',
    'decidedAt',
    'decisionNote',
    'createdAt',
  ],
  Ledger: ['id', 'email', 'year', 'delta', 'kind', 'requestId', 'note', 'createdBy', 'createdAt'],
  Holidays: ['date', 'office', 'name'],
  Settings: ['key', 'value'],
} as const;

export type Table = keyof typeof SCHEMA;
type Row = Record<string, string>;

function sheet(table: Table): GoogleAppsScript.Spreadsheet.Sheet {
  const found = SpreadsheetApp.openById(getConfig('SPREADSHEET_ID')).getSheetByName(table);
  if (!found) throw new Error(`Missing sheet tab: ${table}. Run setupDatabase().`);
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

function updateRow(table: Table, keyColumn: string, key: string, patch: Row): void {
  const s = sheet(table);
  const values = s.getDataRange().getDisplayValues();
  const header = values[0];
  const keyIndex = header.indexOf(keyColumn);
  const rowIndex = values.findIndex((r, i) => i > 0 && r[keyIndex] === key);
  if (rowIndex < 0) throw new Error(`${table} row not found: ${key}`);
  const updated = header.map((h, i) => (h in patch ? patch[h] : values[rowIndex][i]));
  s.getRange(rowIndex + 1, 1, 1, header.length).setValues([updated]);
}

const nullable = (v: string): string | null => (v === '' ? null : v);

function toUser(r: Row): User {
  return {
    email: r.email.trim().toLowerCase(),
    name: r.name,
    office: r.office as Office,
    role: r.role as Role,
    managerEmail: nullable(r.managerEmail.trim().toLowerCase()),
    status: r.status as EmploymentStatus,
    regularizedOn: nullable(r.regularizedOn),
    workingDays: r.workingDays
      .split(',')
      .filter((d) => d.trim() !== '')
      .map((d) => Number(d) as Weekday),
    active: r.active.toUpperCase() === 'TRUE',
  };
}

function toRequest(r: Row): LeaveRequest {
  return {
    id: r.id,
    email: r.email,
    type: r.type as LeaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    days: Number(r.days),
    reason: r.reason,
    status: r.status as RequestStatus,
    approverEmail: nullable(r.approverEmail),
    decidedAt: nullable(r.decidedAt),
    decisionNote: nullable(r.decisionNote),
    createdAt: r.createdAt,
  };
}

function toLedger(r: Row): LedgerEntry {
  return {
    id: r.id,
    email: r.email,
    year: Number(r.year),
    delta: Number(r.delta),
    kind: r.kind as LedgerKind,
    requestId: nullable(r.requestId),
    note: r.note,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  };
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const toRow = (o: object): Row => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, str(v)]));

export const db = {
  users: (): User[] => readRows('Users').map(toUser),
  requests: (): LeaveRequest[] => readRows('Requests').map(toRequest),
  ledger: (): LedgerEntry[] => readRows('Ledger').map(toLedger),
  holidays: (): Holiday[] =>
    readRows('Holidays').map((r) => ({ date: r.date, office: r.office as Office, name: r.name })),

  insertRequest: (r: LeaveRequest): void => appendRow('Requests', toRow(r)),
  updateRequest: (id: string, patch: Partial<LeaveRequest>): void => updateRow('Requests', 'id', id, toRow(patch)),
  insertLedger: (e: LedgerEntry): void => appendRow('Ledger', toRow(e)),
};
