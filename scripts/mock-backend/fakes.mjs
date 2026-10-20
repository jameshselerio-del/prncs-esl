// In-memory fakes of the Google Apps Script services the backend uses. Only the
// methods the backend calls are implemented; anything else throws a TypeError,
// which is a hint to add it here.
import { createHash, randomUUID } from 'node:crypto';

export const MOCK_CLIENT_ID = 'mock-client-id';

/** A controllable clock: real time by default, or frozen at `set(ms)` (tests). */
export function createClock() {
  let fixed = null;
  const now = () => (fixed === null ? Date.now() : fixed);
  class MockDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(now());
      else super(...args);
    }
    static now() {
      return now();
    }
  }
  return {
    Date: MockDate,
    now,
    /** Freezes time at `ms` (a number or ISO string). */
    set(ms) {
      fixed = typeof ms === 'string' ? Date.parse(ms) : ms;
    },
    advance(ms) {
      fixed = now() + ms;
    },
  };
}

// ---------------------------------------------------------------- Spreadsheet

const cell = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v));

class FakeRange {
  constructor(sheet, row, column, numRows, numColumns) {
    Object.assign(this, { sheet, row, column, numRows, numColumns });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const src = this.sheet.data[this.row - 1 + r] ?? [];
      const line = [];
      for (let c = 0; c < this.numColumns; c++) line.push(src[this.column - 1 + c] ?? '');
      out.push(line);
    }
    return out;
  }
  getDisplayValues() {
    return this.getValues();
  }
  setValues(values) {
    if (values.length !== this.numRows || values.some((r) => r.length !== this.numColumns)) {
      throw new Error(
        `The number of rows or columns in the data does not match the range (${this.numRows}x${this.numColumns}).`,
      );
    }
    values.forEach((line, r) => {
      const target = (this.sheet.data[this.row - 1 + r] ??= []);
      line.forEach((v, c) => (target[this.column - 1 + c] = cell(v)));
    });
    this.sheet.normalize();
    return this;
  }
  setValue(value) {
    return this.setValues([[value]]);
  }
  setNumberFormat() {
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class FakeSheet {
  constructor(name, data = []) {
    this.name = name;
    this.data = data.map((r) => r.map(cell));
    this.normalize();
  }
  /** Pads rows to the same width and fills holes, like a real grid. */
  normalize() {
    const width = Math.max(0, ...this.data.map((r) => r?.length ?? 0));
    for (let i = 0; i < this.data.length; i++) {
      const row = (this.data[i] ??= []);
      for (let c = 0; c < width; c++) row[c] ??= '';
    }
  }
  getName() {
    return this.name;
  }
  setName(name) {
    this.name = name;
    return this;
  }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if (this.data[i].some((c) => c !== '')) return i + 1;
    return 0;
  }
  getLastColumn() {
    let last = 0;
    for (const row of this.data) row.forEach((c, i) => c !== '' && (last = Math.max(last, i + 1)));
    return last;
  }
  getMaxRows() {
    return Math.max(1000, this.data.length);
  }
  getMaxColumns() {
    return Math.max(26, this.getLastColumn());
  }
  getDataRange() {
    return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn()));
  }
  getRange(row, column, numRows = 1, numColumns = 1) {
    if (row < 1 || column < 1 || numRows < 1 || numColumns < 1) throw new Error('Invalid range.');
    return new FakeRange(this, row, column, numRows, numColumns);
  }
  appendRow(values) {
    this.data.length = this.getLastRow();
    this.data.push(values.map(cell));
    this.normalize();
    return this;
  }
  deleteRow(position) {
    this.data.splice(position - 1, 1);
  }
  clearContents() {
    this.data = [];
    return this;
  }
  setFrozenRows() {}
  /** Test helper: rows as objects keyed by the header row. */
  records() {
    const [header = [], ...rows] = this.data;
    return rows.filter((r) => r.some((c) => c !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
  }
}

class FakeSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = [new FakeSheet('Sheet1')];
  }
  getId() {
    return this.id;
  }
  getName() {
    return this.name;
  }
  getUrl() {
    return `mock://spreadsheet/${this.id}`;
  }
  getSheets() {
    return [...this.sheets];
  }
  getSheetByName(name) {
    return this.sheets.find((s) => s.name === name) ?? null;
  }
  insertSheet(name, data) {
    if (this.getSheetByName(name)) throw new Error(`A sheet with the name "${name}" already exists.`);
    const sheet = new FakeSheet(name, data);
    this.sheets.push(sheet);
    return sheet;
  }
  deleteSheet(sheet) {
    this.sheets = this.sheets.filter((s) => s !== sheet);
  }
}

// ------------------------------------------------------------------- Utilities

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'long',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  };
}

/** Utilities.formatDate with the common java.text.SimpleDateFormat letters. */
export function formatDate(date, timeZone, pattern) {
  const p = zonedParts(new Date(date.getTime()), timeZone);
  const pad = (n, w) => String(n).padStart(w, '0');
  const h12 = p.hour % 12 || 12;
  const tokens = {
    y: (n) => (n === 2 ? pad(p.year % 100, 2) : String(p.year)),
    M: (n) => (n >= 4 ? MONTHS[p.month - 1] : n === 3 ? MONTHS[p.month - 1].slice(0, 3) : pad(p.month, n)),
    d: (n) => pad(p.day, n),
    E: (n) => (n >= 4 ? p.weekday : p.weekday.slice(0, 3)),
    H: (n) => pad(p.hour, n),
    h: (n) => pad(h12, n),
    m: (n) => pad(p.minute, n),
    s: (n) => pad(p.second, n),
    a: () => (p.hour < 12 ? 'AM' : 'PM'),
  };
  return pattern.replace(/'([^']*)'|([A-Za-z])\2*/g, (match, quoted, letter) => {
    if (quoted !== undefined) return quoted === '' ? "'" : quoted;
    const fn = tokens[letter];
    if (!fn) throw new Error(`Mock Utilities.formatDate does not support "${match}".`);
    return fn(match.length);
  });
}

const toBuffer = (data) =>
  typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(Array.from(data, (b) => b & 0xff));

// ------------------------------------------------------------------- Factory

/**
 * Creates the Apps Script globals. Returns `{ globals, state }`: `globals` go into the
 * vm context; `state` exposes the in-memory data (spreadsheets, properties, sent mail).
 */
export function createGoogleFakes({ log = console, now = Date.now } = {}) {
  const state = {
    spreadsheets: new Map(),
    properties: new Map([['GOOGLE_CLIENT_ID', MOCK_CLIENT_ID]]),
    cache: new Map(),
    mail: [],
    /** MailApp's daily allowance; each sent email uses one. */
    mailQuota: 100,
    triggers: [],
  };

  const SpreadsheetApp = {
    create(name) {
      const id = `mock-sheet-${state.spreadsheets.size + 1}`;
      const ss = new FakeSpreadsheet(id, name);
      state.spreadsheets.set(id, ss);
      return ss;
    },
    openById(id) {
      const ss = state.spreadsheets.get(id);
      if (!ss) throw new Error(`Unexpected error while getting the method or property openById: ${id}`);
      return ss;
    },
  };

  const scriptProperties = {
    getProperty: (key) => state.properties.get(key) ?? null,
    setProperty(key, value) {
      state.properties.set(key, String(value));
      return scriptProperties;
    },
    deleteProperty(key) {
      state.properties.delete(key);
      return scriptProperties;
    },
    getProperties: () => Object.fromEntries(state.properties),
  };
  const PropertiesService = { getScriptProperties: () => scriptProperties };

  // Node runs one request at a time, so the lock only has to be well-formed.
  const scriptLock = {
    waitLock() {},
    tryLock: () => true,
    hasLock: () => true,
    releaseLock() {},
  };
  const LockService = { getScriptLock: () => scriptLock };

  const scriptCache = {
    get(key) {
      const entry = state.cache.get(key);
      if (!entry || entry.expires < now()) return null;
      return entry.value;
    },
    put(key, value, seconds = 600) {
      state.cache.set(key, { value: String(value), expires: now() + seconds * 1000 });
    },
    remove(key) {
      state.cache.delete(key);
    },
  };
  const CacheService = { getScriptCache: () => scriptCache };

  const Utilities = {
    DigestAlgorithm: { SHA_256: 'sha256', SHA_1: 'sha1', MD5: 'md5' },
    getUuid: () => randomUUID(),
    formatDate,
    computeDigest(algorithm, value) {
      return Array.from(createHash(algorithm).update(toBuffer(value)).digest(), (b) => (b > 127 ? b - 256 : b));
    },
    base64Encode: (data) => toBuffer(data).toString('base64'),
    base64EncodeWebSafe: (data) => toBuffer(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    sleep() {},
    /** Minimal Blob: enough for MailApp attachments, which the mock records on each message. */
    newBlob(data, contentType = null, name = null) {
      const text = typeof data === 'string' ? data : toBuffer(data).toString('utf8');
      return {
        getDataAsString: () => text,
        getContentType: () => contentType,
        getName: () => name,
        getBlob() {
          return this;
        },
      };
    },
  };

  /** Mock tokens are `email|Display Name`; anything without an `@` is rejected like an expired token. */
  const UrlFetchApp = {
    fetch(url) {
      const match = /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?id_token=(.*)$/.exec(url);
      if (!match) throw new Error(`Mock UrlFetchApp cannot fetch ${url}`);
      const token = decodeURIComponent(match[1]);
      const [email, name = ''] = token.split('|');
      const valid = /^[^\s@|]+@[^\s@|]+$/.test(email ?? '');
      const body = valid
        ? {
            aud: state.properties.get('GOOGLE_CLIENT_ID'),
            iss: 'https://accounts.google.com',
            email,
            email_verified: 'true',
            exp: String(Math.floor(now() / 1000) + 3600),
            name,
          }
        : { error: 'invalid_token' };
      return { getResponseCode: () => (valid ? 200 : 400), getContentText: () => JSON.stringify(body) };
    },
  };

  const MailApp = {
    sendEmail(message) {
      if (state.mailQuota <= 0) throw new Error('Service invoked too many times for one day: email.');
      state.mailQuota--;
      state.mail.push(message);
      log.log(`[mail] to ${message.to}: ${message.subject}`);
    },
    getRemainingDailyQuota: () => state.mailQuota,
  };

  const ContentService = {
    MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
    createTextOutput(content = '') {
      const output = {
        content,
        mimeType: 'TEXT',
        getContent: () => output.content,
        setMimeType(type) {
          output.mimeType = type;
          return output;
        },
      };
      return output;
    },
  };

  const ScriptApp = {
    getProjectTriggers: () => [...state.triggers],
    deleteTrigger(t) {
      state.triggers = state.triggers.filter((x) => x !== t);
    },
    newTrigger(handler) {
      const trigger = { handler, getHandlerFunction: () => handler };
      const builder = {
        timeBased: () => builder,
        everyHours(n) {
          trigger.everyHours = n;
          return builder;
        },
        create() {
          state.triggers.push(trigger);
          return trigger;
        },
      };
      return builder;
    },
  };

  return {
    state,
    globals: {
      SpreadsheetApp,
      PropertiesService,
      LockService,
      CacheService,
      Utilities,
      UrlFetchApp,
      MailApp,
      ContentService,
      ScriptApp,
    },
  };
}
