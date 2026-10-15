import { getConfig } from './config';
import { ApiError } from './errors';

interface TokenInfo {
  aud: string;
  iss: string;
  email: string;
  email_verified: string;
  exp: string;
}

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/** Verifies a Google Identity Services ID token and returns the signed-in email (lowercased). */
export function verifyIdToken(idToken: unknown): string {
  if (typeof idToken !== 'string' || idToken === '') throw new ApiError('Please sign in.', 'AUTH');

  const cache = CacheService.getScriptCache();
  const cacheKey =
    'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new ApiError('Your session has expired. Please sign in again.', 'AUTH');

  const info = JSON.parse(res.getContentText()) as TokenInfo;
  const secondsLeft = Number(info.exp) - Math.floor(Date.now() / 1000);
  if (
    info.aud !== getConfig('GOOGLE_CLIENT_ID') ||
    !ISSUERS.includes(info.iss) ||
    info.email_verified !== 'true' ||
    secondsLeft <= 0
  ) {
    throw new ApiError('Invalid sign-in. Please sign in again.', 'AUTH');
  }

  const email = info.email.toLowerCase();
  cache.put(cacheKey, email, Math.min(600, secondsLeft));
  return email;
}
