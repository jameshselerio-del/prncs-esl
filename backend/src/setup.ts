import { setConfig } from './config';
import { SCHEMA, type Table } from './db';

/** Bump when SCHEMA changes so deployed scripts upgrade the Sheet on their next request. */
export const SCHEMA_VERSION = '2';

/** Tabs from the earlier leave-tracking version; kept (renamed) rather than deleted. */
const LEGACY_TABS = ['Requests', 'Ledger', 'Holidays'];

/**
 * Converts a leave-tracking Users tab in place: keeps email, name and active;
 * ADMIN stays ADMIN, everyone else becomes STUDENT.
 */
function migrateLegacyUsers(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
  const values = sheet.getDataRange().getDisplayValues();
  const header = values[0];
  if (!header.includes('office')) return;
  const col = (name: string) => header.indexOf(name);
  const now = new Date().toISOString();
  const rows = values
    .slice(1)
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => {
      const isAdmin = r[col('role')].toUpperCase() === 'ADMIN';
      const row: Record<string, string> = {
        email: r[col('email')].trim().toLowerCase(),
        name: r[col('name')],
        role: isAdmin ? 'ADMIN' : 'STUDENT',
        active: r[col('active')].toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE',
        timeZone: r[col('office')] === 'JP' ? 'Asia/Tokyo' : 'Asia/Manila',
        createdAt: now,
      };
      return SCHEMA.Users.map((c) => row[c] ?? '');
    });
  sheet.clearContents();
  if (rows.length) sheet.getRange(2, 1, rows.length, SCHEMA.Users.length).setValues(rows);
  console.log(`Migrated ${rows.length} user(s) from the leave-tracking format.`);
}

/**
 * Run from the Apps Script editor after deploying. Creates the database spreadsheet
 * in the owner's Drive if needed, migrates a leave-tracking database, and makes sure
 * every tab exists with the right header row. Safe to run more than once.
 */
export function setupDatabase(): void {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    const env = props.getProperty('ENVIRONMENT');
    id = SpreadsheetApp.create(`ESL Class Booking — Database${env ? ` (${env})` : ''}`).getId();
    setConfig('SPREADSHEET_ID', id);
  }
  const ss = SpreadsheetApp.openById(id);

  for (const name of LEGACY_TABS) {
    const legacy = ss.getSheetByName(name);
    if (legacy && !ss.getSheetByName(`old_${name}`)) legacy.setName(`old_${name}`);
  }
  const users = ss.getSheetByName('Users');
  if (users) migrateLegacyUsers(users);

  for (const table of Object.keys(SCHEMA) as Table[]) {
    const columns = [...SCHEMA[table]];
    const sheet = ss.getSheetByName(table) ?? ss.insertSheet(table);
    // Plain-text format stops Sheets from turning dates, times and IDs into numbers.
    sheet.getRange(1, 1, sheet.getMaxRows(), columns.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  setConfig('SCHEMA_VERSION', SCHEMA_VERSION);
  console.log(`Database ready: ${ss.getUrl()}`);
}

/**
 * Called on every API request: runs setupDatabase once after a deploy that changed the schema,
 * so the app never runs against a Sheet with missing tabs.
 */
export function ensureDatabase(): void {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_VERSION') === SCHEMA_VERSION) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30_000);
  try {
    if (props.getProperty('SCHEMA_VERSION') !== SCHEMA_VERSION) setupDatabase();
  } finally {
    lock.releaseLock();
  }
}

/** Run once from the editor: replaces all triggers with an hourly class-reminder job. */
export function installTriggers(): void {
  for (const t of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(t);
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
}
