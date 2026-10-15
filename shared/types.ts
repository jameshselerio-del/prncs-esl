export type Office = 'PH' | 'JP';
export type Role = 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
export type EmploymentStatus = 'PROBATIONARY' | 'REGULAR';
export type LeaveType = 'VACATION' | 'SICK' | 'EMERGENCY' | 'UNPAID' | 'HOLIDAY';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LedgerKind = 'GRANT' | 'USE' | 'REFUND' | 'ADJUST';

/** ISO calendar date, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Day of week, 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface User {
  email: string;
  name: string;
  office: Office;
  role: Role;
  managerEmail: string | null;
  status: EmploymentStatus;
  regularizedOn: IsoDate | null;
  workingDays: Weekday[];
  active: boolean;
}

export interface LeaveRequest {
  id: string;
  email: string;
  type: LeaveType;
  startDate: IsoDate;
  endDate: IsoDate;
  days: number;
  reason: string;
  status: RequestStatus;
  approverEmail: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  email: string;
  year: number;
  delta: number;
  kind: LedgerKind;
  requestId: string | null;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface Holiday {
  date: IsoDate;
  office: Office;
  name: string;
}
