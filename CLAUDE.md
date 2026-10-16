# CLAUDE.md

ESL class booking site (one teacher, many students): React SPA (`web/`) on
GitHub Pages → Google Apps Script API (`backend/`) → Google Sheet as database.
Read `docs/requirements.md` and `docs/architecture.md` before changing behaviour.

## Rules

- **Business rules live in `shared/`** (pure TypeScript, no browser or Apps Script
  APIs) and are unit-tested there. Backend and frontend both import them.
- **The backend is authoritative.** Every permission and policy check must run in
  `backend/src/handlers.ts`; frontend checks are previews only.
- **Writes go through `withLock`**, and bookings re-check the slot inside the
  lock, so two students can't book the same time.
- **Times:** bookings are UTC instants (ISO strings). Teacher availability and
  time off are Manila wall time (`shared/time.ts`, fixed UTC+8). The SPA formats
  every time in the viewer's profile time zone (`web/src/time.ts`); never use the
  device zone directly.
- **Never send `privateNote` to students** — student-facing handlers return
  `studentView(booking)`.
- **Never return `Logins` rows** (password hashes) from a handler. Password
  hashing, sessions and reset codes live in `backend/src/passwords.ts`.
- **Booking emails have a bell twin:** where a handler calls `notify.*` for a
  booking event, also call `addNotification` (inside `withLock`) so the in-app
  bell matches the emails (`shared/notifications.ts`).
- Teacher-only actions are listed in `ADMIN_ACTIONS` (`shared/api.ts`) and
  enforced in `backend/src/main.ts`.
- Sheet columns are defined once in `SCHEMA` (`backend/src/db.ts`); add columns
  at the end and update `setupDatabase`.
- New API actions: add to `Api` in `shared/api.ts`, then a handler in
  `handlers.ts`; validate every payload field.
- Backend code must avoid Node/DOM APIs; it targets the Apps Script V8 runtime
  (ES2019) and is bundled by `backend/build.mjs`.

- `scripts/mock-backend/` runs the bundled backend in Node with in-memory fakes of
  the Apps Script services (`fakes.mjs`). If the backend starts using a new Apps
  Script method, add it there. Cover new API behaviour in
  `scripts/mock-backend/backend.test.mjs`.

## Workflow

- `npm run dev:mock` runs the SPA against the local mock API with switchable test
  identities (no Google sign-in); use it to check UI changes in a browser.

- Work is tracked in GitHub Issues; branch per issue, PR into `main`.
- Try backend changes on staging first (`npm run backend:deploy:staging`,
  `npm run dev:staging`); `npm run backend:deploy` releases to production.
- Run `npm run check` before opening a PR (CI runs the same plus `format:check`).
- UI changes: add or update a Playwright spec in `e2e/` and run `npm run test:e2e`
  (it starts its own mock backend and Vite on ports 8790 / 5180). Tests reset
  the mock data in `beforeEach` and run serially.
