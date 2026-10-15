# MVP backlog

Draft of the GitHub issues for the MVP. ✅ = covered by the initial scaffold
(still needs setup/verification against a real Sheet).

## Milestone 1 — Foundation

1. **Set up Google Cloud OAuth client and Apps Script project** — create the
   OAuth web client, clasp project, script properties, run `setupDatabase` and
   `installTriggers`, first web-app deployment. _Labels: setup_
2. **Enable GitHub Pages deployment** — Pages source = Actions, repo variables
   `VITE_GOOGLE_CLIENT_ID` / `VITE_API_URL`, resolve private-repo plan
   requirement. _Labels: setup_
3. **Protect `main`** — require PR + passing CI. _Labels: setup_
4. ✅ **Google Sign-In and server-side token verification** — unknown/inactive
   users rejected with a clear message. _Labels: feature, auth_

## Milestone 2 — Employee flows

5. ✅ **File a leave request** — type limited by employment status, live
   day-count preview, overlap/credit/holiday validation. _Labels: feature_
6. ✅ **My requests and balance dashboard** — available credits, pending
   reservations, request history. _Labels: feature_
7. ✅ **Cancel a request** — pending, or approved before start date; refunds
   credits. _Labels: feature_

## Milestone 3 — Approvals

8. ✅ **Approval queue for direct managers and HR/Admin** — approve/reject with
   note; no self-approval. _Labels: feature_
9. ✅ **Email notifications** — filed → manager (or all admins), decided →
   employee, cancelled → approver. _Labels: feature, email_

## Milestone 4 — Admin

10. **Admin: manage users** — list/add/edit employees (office, role, manager,
    status, working days, active). _Labels: feature, admin_
11. **Admin: CSV bulk upload of users** — template download, row-by-row
    validation with an error report, all-or-nothing import. _Labels: feature, admin_
12. **Admin: regularize an employee** — set status to REGULAR and grant the
    current year's credits immediately. _Labels: feature, admin_
13. **Admin: holiday calendars (PH/JP)** — list/add/remove holidays per office,
    plus CSV import. _Labels: feature, admin_
14. **Admin: manual credit adjustment** — ADJUST ledger entry with mandatory
    reason; ledger history per employee. _Labels: feature, admin_

## Milestone 5 — Visibility and quality

15. **Team calendar** — month view of approved/pending leaves for the
    employee's team (managers: direct reports; admins: everyone, filter by
    office). _Labels: feature_
16. **Playwright end-to-end tests** — sign-in stub, file → approve → balance
    flow, permission checks against the API. _Labels: testing_
17. **Staging environment** — separate Apps Script deployment + Sheet with seed
    data for UAT. _Labels: setup, testing_

## Open questions (to resolve before the related issue)

- Half-day leaves? (affects #5)
- Mid-year regularization: full 5 credits or prorated? (affects #12)
- Past-dated filing allowed only for Sick/Emergency? (affects #5)
