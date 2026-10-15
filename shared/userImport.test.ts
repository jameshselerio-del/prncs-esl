import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';
import type { User } from './types';
import { planUserImport, usersToCsv } from './userImport';

const HEADER = 'email,name,office,role,managerEmail,status,regularizedOn,workingDays,active';

const boss: User = {
  email: 'boss@example.com',
  name: 'Boss',
  office: 'PH',
  role: 'MANAGER',
  managerEmail: null,
  status: 'REGULAR',
  regularizedOn: '2024-01-01',
  workingDays: [1, 2, 3, 4, 5],
  active: true,
};

describe('parseCsv', () => {
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

describe('planUserImport', () => {
  it('plans creates, updates and unchanged rows', () => {
    const csv = [
      HEADER,
      'boss@example.com,Boss,PH,MANAGER,,REGULAR,2024-01-01,"1,2,3,4,5",TRUE',
      'Ana@Example.com,Ana,ph,employee,boss@example.com,probationary,,Mon-Fri,',
      'ken@example.com,Ken,JP,EMPLOYEE,boss@example.com,REGULAR,2026-03-01,1-6,TRUE',
    ].join('\n');
    const plan = planUserImport(csv, [boss, { ...boss, email: 'ken@example.com', name: 'Ken', role: 'EMPLOYEE' }]);
    expect(plan.errors).toEqual([]);
    expect(plan.creates).toEqual(['ana@example.com']);
    expect(plan.updates).toEqual(['ken@example.com']);
    expect(plan.unchanged).toEqual(['boss@example.com']);
    expect(plan.users.map((u) => u.email)).toEqual(['boss@example.com', 'ken@example.com', 'ana@example.com']);
  });

  it('allows managers defined later in the same file', () => {
    const csv = [
      HEADER,
      'ana@example.com,Ana,PH,EMPLOYEE,lead@example.com,PROBATIONARY,,1-5,',
      'lead@example.com,Lead,PH,MANAGER,,REGULAR,2025-01-01,1-5,',
    ].join('\n');
    expect(planUserImport(csv, []).errors).toEqual([]);
  });

  it('reports row errors with line numbers and duplicate emails', () => {
    const csv = [
      HEADER,
      'ana@example.com,Ana,XX,EMPLOYEE,,PROBATIONARY,,1-5,',
      'ana@example.com,Ana again,PH,EMPLOYEE,,PROBATIONARY,,1-5,',
      'bad,,PH,EMPLOYEE,,REGULAR,,someday,',
    ].join('\n');
    const plan = planUserImport(csv, []);
    expect(plan.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(plan.errors[1].messages[0]).toContain('line 2');
    expect(plan.errors[2].messages.length).toBeGreaterThanOrEqual(4);
  });

  it('flags existing users the import would break', () => {
    const report: User = { ...boss, email: 'ana@example.com', name: 'Ana', role: 'EMPLOYEE', managerEmail: boss.email };
    const csv = [HEADER, 'boss@example.com,Boss,PH,EMPLOYEE,,REGULAR,2024-01-01,1-5,TRUE'].join('\n');
    const plan = planUserImport(csv, [boss, report]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toMatchObject({ line: 0, email: 'ana@example.com' });
  });

  it('rejects missing or unknown columns and empty files', () => {
    expect(planUserImport('email,name\nx@y.z,X', []).errors[0].messages[0]).toContain('Missing columns');
    expect(planUserImport(`${HEADER},salary\n`, []).errors[0].messages[0]).toContain('Unknown columns: salary');
    expect(planUserImport(HEADER, []).errors[0].messages[0]).toContain('no data rows');
  });

  it('accepts its own export', () => {
    expect(planUserImport(usersToCsv([boss]), [boss]).unchanged).toEqual([boss.email]);
  });
});
