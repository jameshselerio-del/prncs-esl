/**
 * SHA-256, HMAC-SHA256 and PBKDF2 in plain TypeScript. Apps Script has no PBKDF2 or
 * TextEncoder, so password hashing and session signing use these instead.
 */

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
];

/** UTF-8 bytes of a string. */
export function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export const toHex = (bytes: ArrayLike<number>): string =>
  Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join('');

export function fromHex(hex: string): number[] {
  if (!/^(?:[0-9a-f]{2})*$/i.test(hex)) throw new Error('Invalid hex.');
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

export function sha256(message: ArrayLike<number>): number[] {
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const length = message.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  for (let i = 0; i < length; i++) padded[i] = message[i] & 0xff;
  padded[length] = 0x80;
  const bits = length * 8;
  padded[padded.length - 4] = (bits >>> 24) & 0xff;
  padded[padded.length - 3] = (bits >>> 16) & 0xff;
  padded[padded.length - 2] = (bits >>> 8) & 0xff;
  padded[padded.length - 1] = bits & 0xff;
  padded[padded.length - 5] = Math.floor(length / 0x20000000) & 0xff;

  const w = new Int32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (padded[j] << 24) | (padded[j + 1] << 16) | (padded[j + 2] << 8) | padded[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
  const out: number[] = [];
  for (const word of h) out.push((word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff);
  return out;
}

/** Precomputed inner/outer pads, so PBKDF2 doesn't rehash the key on every iteration. */
function hmacKey(key: ArrayLike<number>): (message: ArrayLike<number>) => number[] {
  let k = Array.from(key, (b) => b & 0xff);
  if (k.length > 64) k = sha256(k);
  while (k.length < 64) k.push(0);
  const inner = k.map((b) => b ^ 0x36);
  const outer = k.map((b) => b ^ 0x5c);
  return (message) => sha256(outer.concat(sha256(inner.concat(Array.from(message, (b) => b & 0xff)))));
}

export const hmacSha256 = (key: ArrayLike<number>, message: ArrayLike<number>): number[] => hmacKey(key)(message);

/** PBKDF2-HMAC-SHA256 producing 32 bytes. */
export function pbkdf2Sha256(password: ArrayLike<number>, salt: ArrayLike<number>, iterations: number): number[] {
  const mac = hmacKey(password);
  let u = mac([...Array.from(salt, (b) => b & 0xff), 0, 0, 0, 1]);
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = mac(u);
    for (let j = 0; j < 32; j++) t[j] ^= u[j];
  }
  return t;
}

/** Compares two strings without returning early, so timing doesn't reveal how much matched. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
