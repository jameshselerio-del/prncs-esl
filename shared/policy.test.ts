import { describe, expect, it } from 'vitest';
import { eachDate, parseIsoDate } from './dates';
import { balanceFor, canCancel, canDecide, leaveDates, validateNewRequest } from './policy';
import type { Holiday, LeaveRequest, LedgerEntry, User } from './types';

const regular: User = {
  email: 'ana@example.com',
  name: 'Ana',
  office: 'PH',
  role: 'EMPLOYEE',
  managerEmail: 'boss@example.com',
  status: 'REGULAR',
  regularizedOn: '2025-06-01',
  workingDays: [1, 2, 3, 4, 5],
  active: true,
};
const probationary: User = { ...regular, email: 'pat@example.com', status: 'PROBATIONARY', regularizedOn: null };
const manager: User = { ...regular, email: 'boss@example.com', role: 'MANAGER', managerEmail: null };
const otherManager: User = { ...manager, email: 'other@example.com' };
const admin: User = { ...regular, email: 'hr@example.com', role: 'ADMIN', managerEmail: null };

// 2026-12-21 is a Monday; 2026-12-25 (Fri) is a PH holiday, 2026-12-23 (Wed) a JP one.
const holidays: Holiday[] = [
  { date: '2026-12-25', office: 'PH', name: 'Christmas Day' },
  { date: '2026-12-23', office: 'JP', name: 'Sample JP holiday' },
];

const base = {
  user: regular,
  type: 'VACATION' as const,
  startDate: '2026-12-21',
  endDate: '2026-12-27',
  today: '2026-12-01',
  holidays,
  existing: [] as LeaveRequest[],
  balance: 5,
};

describe('dates', () => {
  it('rejects impossible dates', () => {
    expect(() => parseIsoDate('2026-02-30')).toThrow();
  });
  it('enumerates inclusive ranges across months', () => {
    expect(eachDate('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });
});

describe('leaveDates', () => {
  it('skips weekends and own-office holidays only', () => {
    expect(leaveDates(regular, 'VACATION', '2026-12-21', '2026-12-27', holidays)).toEqual([
      '2026-12-21',
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
    ]);
  });
  it('respects per-employee working days', () => {
    const sixDay: User = { ...regular, workingDays: [1, 2, 3, 4, 5, 6] };
    expect(leaveDates(sixDay, 'VACATION', '2026-12-21', '2026-12-27', holidays)).toHaveLength(5);
  });
  it('counts only working-day holidays for HOLIDAY leave', () => {
    expect(leaveDates(regular, 'HOLIDAY', '2026-12-21', '2026-12-27', holidays)).toEqual(['2026-12-25']);
    const jp: User = { ...regular, office: 'JP' };
    expect(leaveDates(jp, 'HOLIDAY', '2026-12-21', '2026-12-27', holidays)).toEqual(['2026-12-23']);
  });
});

describe('validateNewRequest', () => {
  it('accepts a valid vacation and returns the day count', () => {
    expect(validateNewRequest(base)).toEqual({ ok: true, days: 4 });
  });
  it('blocks credit leave types for probationary employees', () => {
    const result = validateNewRequest({ ...base, user: probationary, balance: 0 });
    expect(result.ok).toBe(false);
  });
  it('lets probationary employees file unpaid and holiday leave', () => {
    expect(validateNewRequest({ ...base, user: probationary, type: 'UNPAID', balance: 0 })).toEqual({
      ok: true,
      days: 4,
    });
    expect(
      validateNewRequest({
        ...base,
        user: probationary,
        type: 'HOLIDAY',
        startDate: '2026-12-25',
        endDate: '2026-12-25',
        balance: 0,
      }),
    ).toEqual({ ok: true, days: 1 });
  });
  it('rejects holiday leave on non-holidays', () => {
    expect(validateNewRequest({ ...base, type: 'HOLIDAY' }).ok).toBe(false);
  });
  it('rejects requests exceeding the balance', () => {
    expect(validateNewRequest({ ...base, balance: 3 }).ok).toBe(false);
  });
  it('rejects overlapping pending/approved requests but ignores cancelled ones', () => {
    const existing: LeaveRequest = {
      id: 'r1',
      email: regular.email,
      type: 'SICK',
      startDate: '2026-12-22',
      endDate: '2026-12-22',
      days: 1,
      reason: '',
      status: 'APPROVED',
      approverEmail: manager.email,
      decidedAt: null,
      decisionNote: null,
      createdAt: '2026-12-01T00:00:00Z',
    };
    expect(validateNewRequest({ ...base, existing: [existing] }).ok).toBe(false);
    expect(validateNewRequest({ ...base, existing: [{ ...existing, status: 'CANCELLED' }] }).ok).toBe(true);
  });
  it('only allows past dates for sick and emergency leave', () => {
    const past = { ...base, today: '2026-12-28' };
    expect(validateNewRequest(past).ok).toBe(false);
    expect(validateNewRequest({ ...past, type: 'SICK' }).ok).toBe(true);
  });
  it('rejects credit leave spanning two years', () => {
    expect(validateNewRequest({ ...base, startDate: '2026-12-30', endDate: '2027-01-04' }).ok).toBe(false);
  });
});

describe('canDecide', () => {
  it('allows the direct manager and admins', () => {
    expect(canDecide(manager, regular)).toBe(true);
    expect(canDecide(admin, regular)).toBe(true);
  });
  it('blocks other managers and self-approval', () => {
    expect(canDecide(otherManager, regular)).toBe(false);
    expect(canDecide(admin, admin)).toBe(false);
  });
});

describe('canCancel', () => {
  const req = { status: 'APPROVED', startDate: '2026-12-21' } as LeaveRequest;
  it('allows cancelling approved leave only before it starts', () => {
    expect(canCancel(req, '2026-12-20')).toBe(true);
    expect(canCancel(req, '2026-12-21')).toBe(false);
  });
});

describe('balanceFor', () => {
  it('sums ledger entries for the user and year', () => {
    const entry = (delta: number, year = 2026, email = regular.email) => ({ email, year, delta }) as LedgerEntry;
    expect(
      balanceFor([entry(5), entry(-2), entry(1), entry(5, 2025), entry(5, 2026, 'x@example.com')], regular.email, 2026),
    ).toBe(4);
  });
});
