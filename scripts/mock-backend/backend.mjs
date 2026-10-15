// Runs the bundled Apps Script backend (dist/backend/Code.js) in a Node vm context
// with in-memory Google services, so it can be called without Google.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createClock, createGoogleFakes } from './fakes.mjs';

export const CODE_PATH = fileURLToPath(new URL('../../dist/backend/Code.js', import.meta.url));

/** Mock ID tokens are `email|Display Name` (see UrlFetchApp in fakes.mjs). */
export const mockToken = (email, name = '') => `${email}|${name}`;

/**
 * Loads Code.js into a fresh, empty "Apps Script project". Call `setupDatabase()` (or
 * `seed()` from seed.mjs) before making API calls.
 */
export function loadBackend({ codePath = CODE_PATH, log = console, clock = createClock() } = {}) {
  const { globals, state } = createGoogleFakes({ log, now: clock.now });
  const context = vm.createContext({ ...globals, console: log, Date: clock.Date });
  vm.runInContext(readFileSync(codePath, 'utf8'), context, { filename: codePath });

  const backend = {
    clock,
    state,
    /** The fake Apps Script services, e.g. to build a spreadsheet before setupDatabase. */
    google: globals,
    /** Sends a raw POST body to doPost and returns the response text. */
    post(body) {
      return context.doPost({ postData: { contents: body, type: 'text/plain' } }).getContent();
    },
    /** Calls an API action and returns the parsed `ApiResponse`. */
    call(token, action, payload = {}) {
      return JSON.parse(backend.post(JSON.stringify({ action, idToken: token, payload })));
    },
    setupDatabase: () => context.setupDatabase(),
    installTriggers: () => context.installTriggers(),
    sendReminders: () => context.sendReminders(),
    seedDemoData: () => context.seedDemoData(),
    spreadsheet() {
      const id = state.properties.get('SPREADSHEET_ID');
      return id ? state.spreadsheets.get(id) : null;
    },
    /** The fake Sheet for a tab, e.g. `sheet('Bookings').records()`. */
    sheet(name) {
      const found = backend.spreadsheet()?.getSheetByName(name);
      if (!found) throw new Error(`No sheet tab ${name}`);
      return found;
    },
    /** Appends rows given as objects keyed by the tab's header row. */
    insert(table, rows) {
      const sheet = backend.sheet(table);
      const header = sheet.data[0];
      for (const row of rows) sheet.appendRow(header.map((h) => row[h] ?? ''));
    },
  };
  return backend;
}
