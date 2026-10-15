import type { Action, ApiResponse } from '../../shared/api';
import { verifyIdToken } from './auth';
import { db } from './db';
import { ApiError } from './errors';
import { handlers } from './handlers';

export { grantYearlyCredits, installTriggers, setupDatabase } from './setup';

function json(body: ApiResponse<unknown>): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

export function doGet(): GoogleAppsScript.Content.TextOutput {
  return json({ ok: true, data: 'PRNCS Leaves API' });
}

/**
 * Single API entry point. The SPA posts `{ action, idToken, payload }` as text/plain
 * (a "simple" request, so the browser sends no CORS preflight that Apps Script can't answer).
 */
export function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    const body = JSON.parse(e.postData.contents) as { action?: string; idToken?: unknown; payload?: unknown };
    const email = verifyIdToken(body.idToken);
    const me = db.users().find((u) => u.email === email);
    if (!me || !me.active) throw new ApiError(`${email} does not have access. Contact HR.`, 'AUTH');

    const action = body.action as Action;
    if (!Object.prototype.hasOwnProperty.call(handlers, action)) throw new ApiError('Unknown action.');
    const payload = typeof body.payload === 'object' && body.payload !== null ? body.payload : {};
    return json({ ok: true, data: handlers[action](me, payload as Record<string, unknown>) });
  } catch (err) {
    if (err instanceof ApiError) return json({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
