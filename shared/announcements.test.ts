import { describe, expect, it } from 'vitest';
import { announcementErrors, firstName, personalize } from './announcements';

describe('personalize', () => {
  it('fills first name and full name, in any case and spacing', () => {
    const text = 'Hi {first name}! {FirstName}, {Name} — see you soon. { first  name }';
    expect(personalize(text, { name: '  Yuki Tanaka ' })).toBe('Hi Yuki! Yuki, Yuki Tanaka — see you soon. Yuki');
  });

  it('leaves other braces alone and copes with one-word names', () => {
    expect(personalize('{level} {first name}', { name: 'Minh' })).toBe('{level} Minh');
    expect(firstName('')).toBe('');
  });
});

describe('announcementErrors', () => {
  const ok = { title: 'Holiday', body: 'No classes on Friday.', recipients: ['a@example.com'] };

  it('accepts a complete announcement', () => {
    expect(announcementErrors(ok)).toEqual([]);
  });

  it('needs a title, a message and at least one student', () => {
    expect(announcementErrors({ title: ' ', body: '', recipients: [] })).toHaveLength(3);
    expect(announcementErrors({ ...ok, title: 'x'.repeat(121) })).toHaveLength(1);
    expect(announcementErrors({ ...ok, body: 'x'.repeat(5001) })).toHaveLength(1);
    expect(announcementErrors({ ...ok, recipients: Array(501).fill('a@example.com') })).toHaveLength(1);
  });
});
