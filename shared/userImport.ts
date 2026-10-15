import { parseCsv, toCsv } from './csv';
import type { User } from './types';
import { formatWorkingDays, USER_COLUMNS, userFromRecord, validateDirectory } from './users';

export const MAX_IMPORT_ROWS = 1000;
const REQUIRED_COLUMNS = ['email', 'name', 'office', 'role', 'status', 'workingDays'] as const;

export interface ImportRowError {
  /** 1-based line in the file (the header is line 1); 0 = the file as a whole. */
  line: number;
  email: string;
  messages: string[];
}

export interface ImportPlan {
  creates: string[];
  updates: string[];
  unchanged: string[];
  errors: ImportRowError[];
  /** The full directory after the import: existing users (updated in place) followed by new ones. */
  users: User[];
}

const fileError = (message: string): ImportPlan => ({
  creates: [],
  updates: [],
  unchanged: [],
  errors: [{ line: 0, email: '', messages: [message] }],
  users: [],
});

const sameUser = (a: User, b: User): boolean =>
  JSON.stringify({ ...a, workingDays: formatWorkingDays(a.workingDays) }) ===
  JSON.stringify({ ...b, workingDays: formatWorkingDays(b.workingDays) });

/**
 * Validates a users CSV against the existing directory and works out what an import would do.
 * Rows matching an existing email update that user; other rows create users. Nothing is applied here.
 */
export function planUserImport(csvText: string, existing: User[]): ImportPlan {
  let table: string[][];
  try {
    table = parseCsv(csvText).filter((r) => r.some((cell) => cell.trim() !== ''));
  } catch (err) {
    return fileError((err as Error).message);
  }
  if (table.length === 0) return fileError('The file is empty.');

  // Match headers case-insensitively so "Email" or "managerEmail" both work.
  const header = table[0].map((h) => {
    const name = h.trim();
    return USER_COLUMNS.find((c) => c.toLowerCase() === name.toLowerCase()) ?? name;
  });
  const unknown = header.filter((h) => !(USER_COLUMNS as readonly string[]).includes(h));
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (unknown.length || missing.length) {
    return fileError(
      [
        missing.length ? `Missing columns: ${missing.join(', ')}.` : '',
        unknown.length ? `Unknown columns: ${unknown.join(', ')}.` : '',
        `Expected: ${USER_COLUMNS.join(', ')}.`,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }
  if (table.length < 2) return fileError('The file has no data rows.');
  if (table.length - 1 > MAX_IMPORT_ROWS) return fileError(`The file has more than ${MAX_IMPORT_ROWS} rows.`);

  const errors = new Map<number, ImportRowError>();
  const addError = (line: number, email: string, messages: string[]) => {
    const entry = errors.get(line) ?? { line, email, messages: [] };
    entry.messages.push(...messages);
    errors.set(line, entry);
  };

  const imported: { line: number; user: User }[] = [];
  const lineOf = new Map<string, number>();
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const record = Object.fromEntries(header.map((h, col) => [h, cells[col] ?? '']));
    const { user, errors: parseErrors } = userFromRecord(record);
    if (parseErrors.length) addError(line, user.email, parseErrors);
    if (lineOf.has(user.email)) {
      addError(line, user.email, [`Email also appears on line ${lineOf.get(user.email)}.`]);
    } else {
      lineOf.set(user.email, line);
      imported.push({ line, user });
    }
  });

  const byEmail = new Map(imported.map(({ user }) => [user.email, user]));
  const existingEmails = new Set(existing.map((u) => u.email));
  const users = [
    ...existing.map((u) => byEmail.get(u.email) ?? u),
    ...imported.filter(({ user }) => !existingEmails.has(user.email)).map(({ user }) => user),
  ];

  // Imported rows must be fully valid. Untouched users only fail on problems the import introduces
  // (e.g. demoting their manager), not on issues already in the Sheet.
  const before = validateDirectory(existing, existingEmails);
  for (const [email, messages] of validateDirectory(
    users,
    users.map((u) => u.email),
  )) {
    const line = lineOf.get(email);
    if (line !== undefined) {
      addError(line, email, messages);
      continue;
    }
    const added = messages.filter((m) => !before.get(email)?.includes(m));
    if (added.length) addError(0, email, [`Existing user would become invalid: ${added.join(' ')}`]);
  }

  const creates: string[] = [];
  const updates: string[] = [];
  const unchanged: string[] = [];
  const current = new Map(existing.map((u) => [u.email, u]));
  for (const { user } of imported) {
    const old = current.get(user.email);
    if (!old) creates.push(user.email);
    else if (sameUser(old, user)) unchanged.push(user.email);
    else updates.push(user.email);
  }

  return {
    creates,
    updates,
    unchanged,
    errors: [...errors.values()].sort((a, b) => a.line - b.line),
    users,
  };
}

/** CSV of the given users in the import format, so HR can download, edit and re-upload. */
export function usersToCsv(users: User[]): string {
  return toCsv([
    [...USER_COLUMNS],
    ...users.map((u) => [
      u.email,
      u.name,
      u.office,
      u.role,
      u.managerEmail ?? '',
      u.status,
      u.regularizedOn ?? '',
      formatWorkingDays(u.workingDays),
      u.active ? 'TRUE' : 'FALSE',
    ]),
  ]);
}
