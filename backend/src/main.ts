import { ADMIN_ACTIONS, PUBLIC_ACTIONS, SIGNED_OUT_ACTIONS, type Action, type ApiResponse } from '../../shared/api';
import { verifyIdToken, type Identity } from './auth';
import { db } from './db';
import { ApiError } from './errors';
import { handlers, sendReminders } from './handlers';
import { SESSION_PREFIX, verifySession } from './passwords';

import { ensureDatabase, ensureTriggers } from './setup';

export { seedDemoData } from './demo';
export { installTriggers, setupDatabase } from './setup';
export { sendReminders };

function json(body: ApiResponse<unknown>): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

export function doGet(): GoogleAppsScript.Content.TextOutput {
  return json({ ok: true, data: 'ESL Booking API' });
}

/** A Google ID token, or a password session issued by signInWithPassword / setPassword / resetPassword. */
function authenticate(token: unknown, now: Date): Identity {
  if (typeof token === 'string' && token.startsWith(SESSION_PREFIX)) {
    return verifySession(token, now, (email) => db.logins().find((l) => l.email === email));
  }
  return verifyIdToken(token);
}

/**
 * Single API entry point. The SPA posts `{ action, idToken, payload }` as text/plain
 * (a "simple" request, so the browser sends no CORS preflight that Apps Script can't answer).
 */
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    const body = JSON.parse(e.postData.contents) as { action?: string; idToken?: unknown; payload?: unknown };
    const action = body.action as Action;
    if (!Object.prototype.hasOwnProperty.call(handlers, action)) throw new ApiError('Unknown action.');
    const payload = (typeof body.payload === 'object' && body.payload !== null ? body.payload : {}) as Record<
      string,
      unknown
    >;
    const now = new Date();
    ensureDatabase();

    if (SIGNED_OUT_ACTIONS.includes(action)) {
      // Signed-out handlers check the password or code themselves and never read `me`.
      const data = handlers[action]({ me: null, identity: { email: '', name: '' }, now }, payload);
      return json({ ok: true, data });
    }

    const identity = authenticate(body.idToken, now);
    ensureTriggers();
    const me = db.users().find((u) => u.email === identity.email) ?? null;
    if (me && !me.active) throw new ApiError('Your account has been deactivated. Please contact your teacher.', 'AUTH');

    if (!me && !PUBLIC_ACTIONS.includes(action)) throw new ApiError('Please complete your profile first.');
    if (ADMIN_ACTIONS.includes(action) && me?.role !== 'ADMIN') throw new ApiError('Only the teacher can do this.');

    const data = handlers[action]({ me, identity, now }, payload);
    return json({ ok: true, data });
  } catch (err) {
    if (err instanceof ApiError) return json({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
