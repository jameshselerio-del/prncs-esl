# Architecture

```
 Browser (GitHub Pages, static)           Google (owner's account)
 ┌──────────────────────────┐   HTTPS    ┌───────────────────────────┐
 │ React + Vite SPA         │──POST────▶│ Apps Script Web App        │
 │ Google Identity Services │  JSON +    │  - verifies Google ID token│
 │ (gets ID token)          │  idToken   │  - enforces all rules      │
 └──────────────────────────┘◀──JSON────│  - LockService for writes  │
                                         │  - MailApp for emails      │
                                         └────────────┬──────────────┘
                                                      │ SpreadsheetApp
                                         ┌────────────▼──────────────┐
                                         │ Google Sheet (in Drive)    │
                                         │  = the database            │
                                         └───────────────────────────┘
```

## Why this shape

- **Static hosting + Drive storage** rule out a conventional server. Apps
  Script is free, runs under the owner's account, and can read the Sheet and
  send email.
- The browser **never** touches the Sheet directly. Employees have no access to
  the Sheet; only the script does. All permission and policy checks live in the
  backend, so they cannot be bypassed from the browser.
- Domain logic (day counting, eligibility, balances) lives in `shared/` and is
  used by both the backend (authoritative) and the frontend (instant previews).

## Repository layout

```
shared/    Pure TypeScript domain logic + types. Unit-tested with Vitest.
web/       React SPA (Vite). Deployed to GitHub Pages.
backend/   Apps Script source (TypeScript), bundled by esbuild into one
           Code.js and pushed with clasp.
docs/      Requirements, architecture, backlog.
```

## Auth flow

1. SPA renders the Google Sign-In button (Google Identity Services) and gets an
   **ID token** (JWT).
2. Every API call sends `{ action, idToken, payload }` as `text/plain` (avoids a
   CORS preflight, which Apps Script cannot answer).
3. Backend validates the token via Google's `tokeninfo` endpoint: `aud` must
   equal our OAuth client ID and `email_verified` must be true. Results are
   cached briefly with `CacheService`.
4. The email is looked up in the `Users` sheet; unknown or inactive users are
   rejected.

## Sheet schema (one tab per table)

| Tab        | Columns                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Users`    | email, name, office (PH/JP), role (EMPLOYEE/MANAGER/ADMIN), managerEmail, status (PROBATIONARY/REGULAR), regularizedOn, workingDays (e.g. `1,2,3,4,5`; 0=Sun), active |
| `Requests` | id, email, type, startDate, endDate, days, reason, status, approverEmail, decidedAt, decisionNote, createdAt                                                          |
| `Ledger`   | id, email, year, delta, kind (GRANT/USE/REFUND/ADJUST), requestId, note, createdBy, createdAt                                                                         |
| `Holidays` | date, office, name                                                                                                                                                    |
| `Settings` | key, value                                                                                                                                                            |

Balance for a year = sum of `Ledger.delta` for that email and year. The ledger
is append-only, so every change is traceable.

Yearly refresh: a time-driven Apps Script trigger on 1 January writes a
`GRANT +5` row for every active regular employee. Regularization writes the
grant for the current year immediately.

## Limits to keep in mind

- Apps Script email quota: 100 recipients/day on a consumer Gmail account,
  1,500/day on Google Workspace. ~100 users is fine on either.
- Apps Script executions take ~1–3 s; the UI shows loading states and caches
  reads.
- A Sheet comfortably handles tens of thousands of rows; at ~100 users this
  lasts for many years.

## Deployment

- **Frontend:** GitHub Actions builds `web/` and deploys to GitHub Pages on push
  to `main`. GitHub Pages on a private repo requires a paid GitHub plan
  (or the repo must be public).
- **Backend:** `npm run backend:push` bundles and pushes via `clasp`, then a new
  web-app deployment version is created (execute as: _me_, access: _anyone_).
