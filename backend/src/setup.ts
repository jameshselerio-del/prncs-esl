import { ANNUAL_CREDITS } from '../../shared/policy';
import { setConfig } from './config';
import { db, SCHEMA, type Table } from './db';

/**
 * Run once from the Apps Script editor. Creates the database spreadsheet in the
 * owner's Drive (or completes an existing one) with a tab and header row per table.
 */
export function setupDatabase(): void {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  if (!id) {
    id = SpreadsheetApp.create('PRNCS Leaves Tracking — Database').getId();
    setConfig('SPREADSHEET_ID', id);
  }
  const ss = SpreadsheetApp.openById(id);

  for (const table of Object.keys(SCHEMA) as Table[]) {
    const columns = [...SCHEMA[table]];
    const sheet = ss.getSheetByName(table) ?? ss.insertSheet(table);
    // Plain-text format stops Sheets from turning dates and IDs into numbers.
    sheet.getRange(1, 1, sheet.getMaxRows(), columns.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
  console.log(`Database ready: ${ss.getUrl()}`);
}

/** Run once: schedules the yearly credit refresh for 1 January. */
export function installTriggers(): void {
  for (const t of ScriptApp.getProjectTriggers()) {
    if (t.getHandlerFunction() === 'grantYearlyCredits') ScriptApp.deleteTrigger(t);
  }
  // Runs daily; grantYearlyCredits is idempotent, so a missed 1 January run is caught up the next day.
  ScriptApp.newTrigger('grantYearlyCredits').timeBased().everyDays(1).atHour(1).create();
}

/** Grants the yearly credits to every active regular employee who has no grant for this year yet. */
export function grantYearlyCredits(): void {
  const year = new Date().getFullYear();
  const ledger = db.ledger();
  const now = new Date().toISOString();
  for (const user of db.users()) {
    if (!user.active || user.status !== 'REGULAR') continue;
    const granted = ledger.some((e) => e.email === user.email && e.year === year && e.kind === 'GRANT');
    if (granted) continue;
    db.insertLedger({
      id: Utilities.getUuid(),
      email: user.email,
      year,
      delta: ANNUAL_CREDITS,
      kind: 'GRANT',
      requestId: null,
      note: `Yearly credits ${year}`,
      createdBy: 'system',
      createdAt: now,
    });
  }
}
