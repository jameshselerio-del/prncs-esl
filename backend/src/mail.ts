import type { LeaveRequest, User } from '../../shared/types';

function appUrl(): string {
  return PropertiesService.getScriptProperties().getProperty('APP_URL') ?? '';
}

function describe(r: LeaveRequest): string {
  const range = r.startDate === r.endDate ? r.startDate : `${r.startDate} to ${r.endDate}`;
  return `${r.type} leave, ${range} (${r.days} day${r.days === 1 ? '' : 's'})`;
}

function send(to: string[], subject: string, body: string): void {
  const recipients = [...new Set(to.filter(Boolean))];
  if (recipients.length === 0) return;
  try {
    MailApp.sendEmail({ to: recipients.join(','), subject: `[Leaves] ${subject}`, body: `${body}\n\n${appUrl()}` });
  } catch (err) {
    // A failed notification (e.g. daily quota reached) must not roll back the action itself.
    console.error('Email failed', err);
  }
}

/** Direct manager, or every admin when the requester has none. */
export function approversFor(requester: User, users: User[]): string[] {
  if (requester.managerEmail) return [requester.managerEmail];
  return users.filter((u) => u.active && u.role === 'ADMIN' && u.email !== requester.email).map((u) => u.email);
}

export const notify = {
  filed(r: LeaveRequest, requester: User, users: User[]): void {
    send(
      approversFor(requester, users),
      `${requester.name} filed a leave request`,
      `${requester.name} filed ${describe(r)}.\nReason: ${r.reason || '—'}\n\nOpen the app to approve or reject.`,
    );
  },
  decided(r: LeaveRequest, approver: User): void {
    const verb = r.status === 'APPROVED' ? 'approved' : 'rejected';
    send(
      [r.email],
      `Your leave was ${verb}`,
      `${approver.name} ${verb} your ${describe(r)}.${r.decisionNote ? `\nNote: ${r.decisionNote}` : ''}`,
    );
  },
  cancelled(r: LeaveRequest, requester: User, users: User[]): void {
    const to = r.approverEmail ? [r.approverEmail] : approversFor(requester, users);
    send(to, `${requester.name} cancelled a leave`, `${requester.name} cancelled ${describe(r)}.`);
  },
};
