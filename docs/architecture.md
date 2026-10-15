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
- The browser **never** touches the Sheet directly. Students have no access to
  the Sheet; only the script does. All permission and booking checks live in the
  backend, so they cannot be bypassed from the browser.
- Domain logic (slot generation, booking and cancellation rules, validation)
  lives in `shared/` and is used by both the backend (authoritative) and the
  frontend (instant previews).

## Repository layout

```
shared/    Pure TypeScript domain logic + types. Unit-tested with Vitest.
web/       React SPA (Vite). Deployed to GitHub Pages.
backend/   Apps Script source (TypeScript), bundled by esbuild into one
           Code.js and pushed with clasp.
scripts/   Dev tooling. mock-backend/ runs the bundled Code.js in Node with
           in-memory Google fakes (local mock API + backend end-to-end tests).
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
4. The email is looked up in the `Users` sheet. Inactive users are rejected.
   Unknown users may only call `me` and `register` (open sign-up), which
   creates a Student row from their profile.

### Username and password (optional)

A registered user can add a username and password on their Profile page
(`setPassword`; changing it needs the current password). Accounts always start
with Google, so every email address is verified by Google.

- `signInWithPassword`, `requestPasswordReset` and `resetPassword` need no token
  (`SIGNED_OUT_ACTIONS`). Sign-in accepts the username or the email.
- Passwords are stored as PBKDF2-HMAC-SHA256 hashes with a random salt in the
  `Logins` tab, never in `Users`, so no handler can return them by accident.
  Hashing is pure TypeScript (`shared/crypto.ts`) because Apps Script has no
  PBKDF2; the iteration count is stored with each hash so it can be raised.
- A successful sign-in returns a session token `pw.<claims>.<HMAC>` signed with
  the `SESSION_SECRET` script property (created on first use; delete it to sign
  everyone out). The SPA sends it in place of the Google ID token. Sessions last
  12 hours and are tied to a fingerprint of the current password hash, so
  changing or resetting the password ends every older session.
- Five wrong passwords or reset codes lock password sign-in for that account
  for 15 minutes (`CacheService`); Google sign-in still works.
- "Forgot password?" emails a 6-digit code (15 minutes, one per minute, five
  tries). Unknown usernames get the same response, and every new password is
  confirmed by email.

## Sheet schema (one tab per table)

| Tab            | Columns                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Users`        | email, name, role (ADMIN/STUDENT), active, timeZone, level, nativeLanguage, goals, contact, createdAt                                                                                                                                  |
| `Availability` | id, weekday (0=Sun…6=Sat), start (HH:MM), end (HH:MM) — teacher's weekly hours in Manila time                                                                                                                                          |
| `TimeOff`      | id, startDate, endDate, note — whole Manila days off                                                                                                                                                                                   |
| `Bookings`     | id, studentEmail, start, end (UTC ISO), status (CONFIRMED/CANCELLED/COMPLETED/NO_SHOW), lessonId, topic, studentNote, meetingLink, materials, feedback, privateNote, createdAt, cancelledAt, cancelledBy, cancelReason, reminderSentAt |
| `Lessons`      | id, title, level, summary, content, materialsUrl, createdAt                                                                                                                                                                            |
| `Settings`     | key, value (lesson length, slot step, notice periods, booking window, default meeting link, school name)                                                                                                                               |
| `Logins`       | email, username (lowercase), passwordHash (`pbkdf2-sha256$iterations$salt$hash`), updatedAt — only for users who added a password                                                                                                      |

`setupDatabase` creates missing tabs and is safe to re-run. It also migrates the
earlier leave-tracking Sheet: the Users tab is converted (ADMIN stays ADMIN,
everyone else becomes STUDENT) and the old leave tabs are renamed with an
`old_` prefix rather than deleted.

## Time zones

- Teacher availability and time off are in **Asia/Manila** (UTC+8, no daylight
  saving), so a Manila wall time converts to UTC by subtracting 8 hours.
- Bookings are stored as UTC instants. The SPA formats them in the viewer's
  profile time zone (defaulting to the browser's).

## Background jobs

`installTriggers` sets up an hourly `sendReminders` trigger that emails students
about confirmed classes starting within 24 hours, once per booking
(`reminderSentAt`).

## Limits to keep in mind

- Apps Script email quota: 100 recipients/day on a consumer Gmail account,
  1,500/day on Google Workspace. Each booking sends up to 3 emails
  (confirmation, teacher notice, reminder), so a consumer account handles
  roughly 30 bookings a day.
- Apps Script executions take ~1–3 s; the UI shows loading states and caches
  reads.
- A Sheet comfortably handles tens of thousands of rows; at ~100 users this
  lasts for many years.
- Availability is computed on each request from the weekly rules, time off and
  bookings for the booking window (about 30 days), which stays small.

## Deployment

- **Frontend:** GitHub Actions builds `web/` and deploys to GitHub Pages on push
  to `main`. GitHub Pages on a private repo requires a paid GitHub plan
  (or the repo must be public).
- **Backend:** `npm run backend:deploy` bundles, pushes via `clasp` and updates
  the existing web-app deployment (execute as: _me_, access: _anyone_), keeping
  the `/exec` URL stable.
