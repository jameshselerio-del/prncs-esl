import type { Action, Api, CreditSummary } from '../../shared/api';
import { parseIsoDate } from '../../shared/dates';
import {
  allowedLeaveTypes,
  balanceFor,
  canCancel,
  canDecide,
  CREDIT_TYPES,
  LEAVE_TYPES,
  reservedCredits,
  validateNewRequest,
} from '../../shared/policy';
import type { IsoDate, LeaveRequest, LeaveType, Office, User } from '../../shared/types';
import { db } from './db';
import { ApiError } from './errors';
import { notify } from './mail';

const TIME_ZONES: Record<Office, string> = { PH: 'Asia/Manila', JP: 'Asia/Tokyo' };

function todayFor(user: User): IsoDate {
  return Utilities.formatDate(new Date(), TIME_ZONES[user.office], 'yyyy-MM-dd');
}

const nowIso = (): string => new Date().toISOString();

/** Serializes writes so two requests can't spend the same credits. */
function withLock<T>(fn: () => T): T {
  const lock = LockService.getScriptLock();
  lock.waitLock(20_000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function credits(email: string, year: number): CreditSummary {
  const balance = balanceFor(db.ledger(), email, year);
  const reserved = reservedCredits(db.requests(), email, year);
  return { year, balance, reserved, available: balance - reserved };
}

function requireString(payload: Record<string, unknown>, field: string, maxLength = 500): string {
  const value = payload[field];
  if (typeof value !== 'string') throw new ApiError(`Missing ${field}.`);
  if (value.length > maxLength) throw new ApiError(`${field} is too long.`);
  return value;
}

function requireDate(payload: Record<string, unknown>, field: string): IsoDate {
  const value = requireString(payload, field, 10);
  try {
    parseIsoDate(value);
  } catch {
    throw new ApiError(`Invalid ${field}.`);
  }
  return value;
}

function findRequest(id: string): LeaveRequest {
  const request = db.requests().find((r) => r.id === id);
  if (!request) throw new ApiError('Request not found.');
  return request;
}

function findUser(email: string, users = db.users()): User {
  const user = users.find((u) => u.email === email);
  if (!user) throw new ApiError(`User not found: ${email}`);
  return user;
}

type Handler<A extends Action> = (me: User, payload: Record<string, unknown>) => Api[A][1];

export const handlers: { [A in Action]: Handler<A> } = {
  me(me) {
    const today = todayFor(me);
    const users = db.users();
    return {
      user: me,
      today,
      credits: credits(me.email, Number(today.slice(0, 4))),
      allowedTypes: allowedLeaveTypes(me),
      isApprover: me.role === 'ADMIN' || users.some((u) => u.managerEmail === me.email),
    };
  },

  myRequests(me) {
    return db
      .requests()
      .filter((r) => r.email === me.email)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },

  holidays(me) {
    return db.holidays().filter((h) => h.office === me.office);
  },

  createRequest(me, payload) {
    const type = requireString(payload, 'type', 20) as LeaveType;
    if (!LEAVE_TYPES.includes(type)) throw new ApiError('Unknown leave type.');
    const startDate = requireDate(payload, 'startDate');
    const endDate = requireDate(payload, 'endDate');
    const reason = requireString(payload, 'reason');

    const request = withLock(() => {
      const result = validateNewRequest({
        user: me,
        type,
        startDate,
        endDate,
        today: todayFor(me),
        holidays: db.holidays(),
        existing: db.requests().filter((r) => r.email === me.email),
        balance: credits(me.email, Number(startDate.slice(0, 4))).available,
      });
      if (!result.ok) throw new ApiError(result.errors.join(' '));

      const created: LeaveRequest = {
        id: Utilities.getUuid(),
        email: me.email,
        type,
        startDate,
        endDate,
        days: result.days,
        reason,
        status: 'PENDING',
        approverEmail: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: nowIso(),
      };
      db.insertRequest(created);
      return created;
    });

    notify.filed(request, me, db.users());
    return request;
  },

  cancelRequest(me, payload) {
    const id = requireString(payload, 'id', 64);
    const cancelled = withLock(() => {
      const request = findRequest(id);
      if (request.email !== me.email) throw new ApiError('You can only cancel your own requests.');
      if (!canCancel(request, todayFor(me))) throw new ApiError('This request can no longer be cancelled.');

      if (request.status === 'APPROVED' && CREDIT_TYPES.has(request.type)) {
        db.insertLedger({
          id: Utilities.getUuid(),
          email: me.email,
          year: Number(request.startDate.slice(0, 4)),
          delta: request.days,
          kind: 'REFUND',
          requestId: request.id,
          note: 'Cancelled by employee',
          createdBy: me.email,
          createdAt: nowIso(),
        });
      }
      db.updateRequest(id, { status: 'CANCELLED' });
      return { ...request, status: 'CANCELLED' as const };
    });

    notify.cancelled(cancelled, me, db.users());
    return cancelled;
  },

  pendingApprovals(me) {
    const users = db.users();
    return db
      .requests()
      .filter((r) => r.status === 'PENDING')
      .flatMap((r) => {
        const requester = users.find((u) => u.email === r.email);
        return requester && canDecide(me, requester) ? [{ ...r, requesterName: requester.name }] : [];
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  },

  decideRequest(me, payload) {
    const id = requireString(payload, 'id', 64);
    const decision = requireString(payload, 'decision', 10);
    if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new ApiError('Invalid decision.');
    const note = typeof payload.note === 'string' ? payload.note.slice(0, 500) : '';

    const decided = withLock(() => {
      const request = findRequest(id);
      if (request.status !== 'PENDING') throw new ApiError('This request has already been decided.');
      const requester = findUser(request.email);
      if (!canDecide(me, requester)) throw new ApiError('You are not allowed to decide on this request.');

      if (decision === 'APPROVED' && CREDIT_TYPES.has(request.type)) {
        const year = Number(request.startDate.slice(0, 4));
        // Pending reservations already include this request, so check against the raw balance.
        if (balanceFor(db.ledger(), requester.email, year) < request.days) {
          throw new ApiError('The employee no longer has enough credits for this request.');
        }
        db.insertLedger({
          id: Utilities.getUuid(),
          email: requester.email,
          year,
          delta: -request.days,
          kind: 'USE',
          requestId: request.id,
          note: `${request.type} ${request.startDate}–${request.endDate}`,
          createdBy: me.email,
          createdAt: nowIso(),
        });
      }

      const patch = {
        status: decision,
        approverEmail: me.email,
        decidedAt: nowIso(),
        decisionNote: note || null,
      } as const;
      db.updateRequest(id, patch);
      return { ...request, ...patch };
    });

    notify.decided(decided, me);
    return decided;
  },
};
