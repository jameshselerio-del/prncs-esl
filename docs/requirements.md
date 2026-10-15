# Requirements — PRNCS Leaves Tracking

## Scope

A web app for filing, approving and tracking employee leaves across the
**Philippines** and **Japan** offices (~100 users).

## Roles

| Role       | Can do                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| Employee   | File, view and cancel own leave requests; view own balance and the team calendar                                |
| Manager    | Everything an employee can, plus approve/reject requests of employees who **report directly** to them           |
| HR / Admin | Everything above, plus approve/reject **any** request, manage users, holidays and settings, bulk-import via CSV |

Approval rules (enforced server-side):

- An approver must be the requester's **direct manager** or an **HR/Admin**.
- No one can approve or reject their **own** request (an HR/Admin's own leave
  is approved by their manager or another HR/Admin).

## Leave types and policy

| Type      | Probationary | Regular | Uses credits |
| --------- | ------------ | ------- | ------------ |
| Vacation  | ✗            | ✓       | Yes          |
| Sick      | ✗            | ✓       | Yes          |
| Emergency | ✗            | ✓       | Yes          |
| Unpaid    | ✓            | ✓       | No           |
| Holiday   | ✓            | ✓       | No           |

- **Probationary** employees have **0 credits** and can only file _Unpaid_ and
  _Holiday_ leave.
- **Regular** employees get **one shared pool of 5 credits per year** used by
  Vacation, Sick and Emergency.
- Credits **refresh every 1 January**. Unused credits do not carry over.
- **Holiday leave** = taking a public holiday off when that holiday falls on one
  of the employee's working days. It may only be filed for dates that are public
  holidays in the employee's office calendar, and uses no credits.

## Calendars and working days

- Each employee has their own **working days** (e.g. Mon–Fri, Mon–Sat).
- Each employee belongs to one **office**: `PH` or `JP`. The office decides
  which public holiday calendar applies.
- A leave request's **day count** = the dates in the range that are the
  employee's working days, excluding public holidays of their office (except
  for _Holiday_ leave, which counts only those holidays).
- Leaves that use credits cannot span two calendar years.
- Requests must not overlap another pending/approved request of the same
  employee.

## Request lifecycle

`PENDING → APPROVED | REJECTED`, and `PENDING | APPROVED (future) → CANCELLED`
by the requester. Cancelling an approved request refunds its credits.

## Notifications (email only)

| Event               | Recipients                          |
| ------------------- | ----------------------------------- |
| Request filed       | Direct manager (+ HR if no manager) |
| Approved / rejected | Requester                           |
| Cancelled           | Approver(s) who were notified       |

## Admin features

- **CSV bulk upload** for users (and holidays). Validated row-by-row; errors are
  reported without importing partial bad rows.
- Manual balance adjustment with a reason (recorded in the ledger).

## Non-functional

- Static hosting (GitHub Pages); data stored in a Google Sheet in the owner's
  Google Drive.
- Sign-in with Google. Only emails present in the Users sheet (and active) can
  use the app.
- No compliance / data-retention requirements.

## Open questions

1. Half-day leaves — supported? (MVP assumes whole days only.)
2. Mid-year regularization — full 5 credits or prorated? (MVP assumes full 5.)
3. Can employees file leave in the past (e.g. sick leave after the fact)?
   (MVP allows past dates for Sick and Emergency only.)
