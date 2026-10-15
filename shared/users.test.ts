import { describe, expect, it } from 'vitest';
import type { User } from './types';
import { parseWorkingDays, userFromRecord, validateDirectory } from './users';

const user = (overrides: Partial<User>): User => ({
  email: 'ana@example.com',
  name: 'Ana',
  office: 'PH',
  role: 'EMPLOYEE',
  managerEmail: null,
  status: 'PROBATIONARY',
  regularizedOn: null,
  workingDays: [1, 2, 3, 4, 5],
  active: true,
  ...overrides,
});

describe('parseWorkingDays', () => {
  it('accepts numbers, names and ranges', () => {
    expect(parseWorkingDays('1,2,3,4,5')).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkingDays('Mon-Fri')).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkingDays('sat; mon ;Wednesday')).toEqual([1, 3, 6]);
    expect(parseWorkingDays('1-3|5')).toEqual([1, 2, 3, 5]);
  });
  it('rejects unknown days and backwards ranges', () => {
    expect(parseWorkingDays('7')).toBeNull();
    expect(parseWorkingDays('Fri-Mon')).toBeNull();
    expect(parseWorkingDays('Funday')).toBeNull();
  });
});

describe('userFromRecord', () => {
  it('normalizes case, blanks and defaults active to true', () => {
    const { user: u, errors } = userFromRecord({
      email: ' Ana@Example.com ',
      name: 'Ana',
      office: 'ph',
      role: 'employee',
      managerEmail: '',
      status: 'regular',
      regularizedOn: '2026-01-15',
      workingDays: 'Mon-Fri',
      active: '',
    });
    expect(errors).toEqual([]);
    expect(u).toMatchObject({
      email: 'ana@example.com',
      office: 'PH',
      status: 'REGULAR',
      managerEmail: null,
      active: true,
    });
  });
  it('reports unparseable fields', () => {
    expect(userFromRecord({ workingDays: 'someday', active: 'maybe' }).errors).toHaveLength(2);
  });
});

describe('validateDirectory', () => {
  const boss = user({ email: 'boss@example.com', name: 'Boss', role: 'MANAGER' });

  it('accepts a valid directory', () => {
    const users = [boss, user({ managerEmail: boss.email })];
    expect(
      validateDirectory(
        users,
        users.map((u) => u.email),
      ).size,
    ).toBe(0);
  });
  it('requires a regularized date for regular employees', () => {
    expect(validateDirectory([user({ status: 'REGULAR' })], ['ana@example.com']).get('ana@example.com')).toContain(
      'Regularized date is required for regular employees.',
    );
  });
  it('rejects unknown managers and managers without a manager role', () => {
    const peer = user({ email: 'peer@example.com', name: 'Peer' });
    expect(validateDirectory([user({ managerEmail: 'ghost@example.com' })], ['ana@example.com']).size).toBe(1);
    expect(validateDirectory([peer, user({ managerEmail: peer.email })], ['ana@example.com']).size).toBe(1);
  });
  it('rejects duplicates and reporting cycles', () => {
    expect(validateDirectory([user({}), user({})], ['ana@example.com']).size).toBe(1);
    const a = user({ role: 'MANAGER', managerEmail: 'b@example.com' });
    const b = user({ email: 'b@example.com', name: 'B', role: 'MANAGER', managerEmail: a.email });
    expect(validateDirectory([a, b], [a.email]).get(a.email)).toContain('Reporting line forms a cycle.');
  });
  it('only reports on the emails asked about', () => {
    const broken = user({ email: 'broken@example.com', name: '' });
    expect(validateDirectory([broken, user({})], ['ana@example.com']).size).toBe(0);
  });
});
