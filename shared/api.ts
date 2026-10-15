import type { Holiday, IsoDate, LeaveRequest, LeaveType, User } from './types';

/** The contract between the SPA and the Apps Script backend. */

export interface CreditSummary {
  year: number;
  /** Ledger balance for the year. */
  balance: number;
  /** Credits held by pending requests. */
  reserved: number;
  available: number;
}

export interface MeResult {
  user: User;
  today: IsoDate;
  credits: CreditSummary;
  allowedTypes: LeaveType[];
  isApprover: boolean;
}

export interface CreateRequestPayload {
  type: LeaveType;
  startDate: IsoDate;
  endDate: IsoDate;
  reason: string;
}

export interface DecidePayload {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  note?: string;
}

export interface PendingApproval extends LeaveRequest {
  requesterName: string;
}

type Empty = Record<string, never>;

/** action name → [payload, result] */
export interface Api {
  me: [Empty, MeResult];
  myRequests: [Empty, LeaveRequest[]];
  holidays: [Empty, Holiday[]];
  createRequest: [CreateRequestPayload, LeaveRequest];
  cancelRequest: [{ id: string }, LeaveRequest];
  pendingApprovals: [Empty, PendingApproval[]];
  decideRequest: [DecidePayload, LeaveRequest];
}

export type Action = keyof Api;

export interface ApiEnvelope<A extends Action = Action> {
  action: A;
  idToken: string;
  payload: Api[A][0];
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string; code?: 'AUTH' };
