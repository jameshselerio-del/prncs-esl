import { constantTimeEqual, fromHex, hmacSha256, pbkdf2Sha256, sha256, toHex, utf8 } from '../../shared/crypto';
import type { Identity } from './auth';
import type { Login } from './db';
import { ApiError } from './errors';

/**
 * Password sign-in: PBKDF2 hashes, signed session tokens, attempt limits and reset codes.
 * Apps Script is slow at hashing, so the iteration count is modest and stored with each
 * hash; raise ITERATIONS and old hashes keep working.
 */
const ITERATIONS = 10_000;
const SESSION_HOURS = 12;
const MAX_FAILURES = 5;
const LOCKOUT_SECONDS = 15 * 60;
const RESET_CODE_SECONDS = 15 * 60;
const RESET_RESEND_SECONDS = 60;
const MAX_CODE_TRIES = 5;

export const SESSION_PREFIX = 'pw.';

/** 128 random bits as hex (a v4 UUID has 122 random bits; two are plenty). */
const randomHex = (): string => (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);

export function hashPassword(password: string): string {
  const salt = randomHex();
  return `pbkdf2-sha256$${ITERATIONS}$${salt}$${toHex(pbkdf2Sha256(utf8(password), fromHex(salt), ITERATIONS))}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, iterations, salt, hash] = stored.split('$');
  const n = Number(iterations);
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(n) || n < 1 || !salt || !hash) return false;
  return constantTimeEqual(toHex(pbkdf2Sha256(utf8(password), fromHex(salt), n)), hash);
}

// ------------------------------------------------------------------ Sessions

function sessionSecret(): string {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty('SESSION_SECRET');
  if (existing) return existing;
  const lock = LockService.getScriptLock();
  lock.waitLock(20_000);
  try {
    const again = props.getProperty('SESSION_SECRET');
    if (again) return again;
    const secret = randomHex() + randomHex();
    props.setProperty('SESSION_SECRET', secret);
    return secret;
  } finally {
    lock.releaseLock();
  }
}

const sign = (body: string): string => toHex(hmacSha256(utf8(sessionSecret()), utf8(body)));

interface SessionClaims {
  /** email */
  e: string;
  /** expiry, ms since epoch */
  x: number;
  /** fingerprint of the password hash when issued */
  v: string;
}

/** Changes with every new password (each gets a fresh salt), so older sessions stop working. */
const fingerprint = (login: Login): string => toHex(sha256(utf8(login.passwordHash))).slice(0, 16);

/** `pw.<hex JSON claims>.<hex HMAC>`. Signed, not encrypted: the claims are not secret. */
export function createSession(login: Login, now: Date): string {
  const claims: SessionClaims = { e: login.email, x: now.getTime() + SESSION_HOURS * 3_600_000, v: fingerprint(login) };
  const body = toHex(utf8(JSON.stringify(claims)));
  return `${SESSION_PREFIX}${body}.${sign(body)}`;
}

/** Checks a session token; `findLogin` looks up the current login, so a password change ends older sessions. */
export function verifySession(token: string, now: Date, findLogin: (email: string) => Login | undefined): Identity {
  const expired = new ApiError('Your session has expired. Please sign in again.', 'AUTH');
  const [body, signature] = token.slice(SESSION_PREFIX.length).split('.');
  if (!body || !signature || !constantTimeEqual(sign(body), signature)) throw expired;
  let claims: SessionClaims;
  try {
    claims = JSON.parse(decodeURIComponent(body.replace(/../g, '%$&'))) as SessionClaims;
  } catch {
    throw expired;
  }
  const login = findLogin(claims.e);
  if (!login || !constantTimeEqual(fingerprint(login), String(claims.v)) || claims.x <= now.getTime()) throw expired;
  return { email: login.email, name: '' };
}

// ------------------------------------------------------------ Attempt limits

const failureKey = (email: string) => 'pwfail_' + toHex(sha256(utf8(email)));

/** Refuses password checks for an account after too many recent failures. */
export function checkNotLockedOut(email: string): void {
  const failures = Number(CacheService.getScriptCache().get(failureKey(email)) ?? 0);
  if (failures >= MAX_FAILURES) {
    throw new ApiError('Too many incorrect attempts. Please wait 15 minutes, or sign in with Google.');
  }
}

export function recordFailure(email: string): void {
  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get(failureKey(email)) ?? 0) + 1;
  cache.put(failureKey(email), String(failures), LOCKOUT_SECONDS);
}

export function clearFailures(email: string): void {
  CacheService.getScriptCache().remove(failureKey(email));
}

// --------------------------------------------------------------- Reset codes

interface ResetEntry {
  /** SHA-256 of email + code */
  h: string;
  tries: number;
  /** issued at, ms */
  at: number;
}

const resetKey = (email: string) => 'pwreset_' + toHex(sha256(utf8(email)));
const codeHash = (email: string, code: string) => toHex(sha256(utf8(`${email}|${code}`)));

/** A new 6-digit code, or null if one was sent less than a minute ago (stops email flooding). */
export function issueResetCode(email: string, now: Date): string | null {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(resetKey(email));
  if (raw && now.getTime() - (JSON.parse(raw) as ResetEntry).at < RESET_RESEND_SECONDS * 1000) return null;
  const code = String(parseInt(randomHex().slice(0, 12), 16) % 1_000_000).padStart(6, '0');
  const entry: ResetEntry = { h: codeHash(email, code), tries: 0, at: now.getTime() };
  cache.put(resetKey(email), JSON.stringify(entry), RESET_CODE_SECONDS);
  return code;
}

/** Uses up a reset code: true if it matches; a wrong guess counts against the code. */
export function consumeResetCode(email: string, code: string, now: Date): boolean {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(resetKey(email));
  if (!raw) return false;
  const entry = JSON.parse(raw) as ResetEntry;
  if (entry.tries < MAX_CODE_TRIES && constantTimeEqual(codeHash(email, code.trim()), entry.h)) {
    cache.remove(resetKey(email));
    return true;
  }
  const secondsLeft = Math.floor(RESET_CODE_SECONDS - (now.getTime() - entry.at) / 1000);
  if (secondsLeft > 0) cache.put(resetKey(email), JSON.stringify({ ...entry, tries: entry.tries + 1 }), secondsLeft);
  return false;
}
