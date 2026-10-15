import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('handles quotes, escaped quotes, embedded commas/newlines, CRLF and BOM', () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'a,"b,c","say ""hi"""\r\n"multi\nline",x,\r\n')).toEqual([
      ['a', 'b,c', 'say "hi"'],
      ['multi\nline', 'x', ''],
    ]);
  });
  it('round-trips through toCsv', () => {
    const rows = [
      ['a', 'b,c'],
      ['"q"', ''],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,"b')).toThrow();
  });
});
