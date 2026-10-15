import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { constantTimeEqual, fromHex, hmacSha256, pbkdf2Sha256, sha256, toHex, utf8 } from './crypto';

describe('utf8', () => {
  it('matches Node for ASCII, Japanese and emoji', () => {
    for (const s of ['', 'abc', 'パスワード', 'café 🍃']) expect(utf8(s)).toEqual([...Buffer.from(s, 'utf8')]);
  });
});

describe('sha256', () => {
  it('matches Node across block boundaries', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const data = Buffer.alloc(n, n % 251);
      expect(toHex(sha256([...data]))).toBe(createHash('sha256').update(data).digest('hex'));
    }
  });
});

describe('hmacSha256', () => {
  it('matches Node for short and long keys', () => {
    for (const key of ['k', 'x'.repeat(100)]) {
      expect(toHex(hmacSha256(utf8(key), utf8('message')))).toBe(
        createHmac('sha256', key).update('message').digest('hex'),
      );
    }
  });
});

describe('pbkdf2Sha256', () => {
  it('matches Node', () => {
    const salt = fromHex('00ff10a0');
    expect(toHex(pbkdf2Sha256(utf8('パスワード123'), salt, 1000))).toBe(
      pbkdf2Sync('パスワード123', Buffer.from(salt), 1000, 32, 'sha256').toString('hex'),
    );
  });
});

describe('constantTimeEqual', () => {
  it('compares strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});
