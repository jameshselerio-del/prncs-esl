# CLAUDE.md

Leave tracking app: React SPA (`web/`) on GitHub Pages → Google Apps Script API
(`backend/`) → Google Sheet as database. Read `docs/requirements.md` and
`docs/architecture.md` before changing behaviour.

## Rules

- **Business rules live in `shared/`** (pure TypeScript, no browser or Apps Script
  APIs) and are unit-tested there. Backend and frontend both import them.
- **The backend is authoritative.** Every permission and policy check must run in
  `backend/src/handlers.ts`; frontend checks are previews only.
- **Writes go through `withLock`** so concurrent requests can't double-spend credits.
- **Credits are a ledger.** Never store a balance; append `Ledger` rows
  (GRANT/USE/REFUND/ADJUST).
- **Dates are `YYYY-MM-DD` strings**, compared as strings and parsed as UTC via
  `shared/dates.ts`. "Today" is computed in the employee's office time zone.
- Sheet columns are defined once in `SCHEMA` (`backend/src/db.ts`); add columns
  at the end and update `setupDatabase`.
- New API actions: add to `Api` in `shared/api.ts`, then a handler in
  `handlers.ts`; validate every payload field.
- Backend code must avoid Node/DOM APIs; it targets the Apps Script V8 runtime
  (ES2019) and is bundled by `backend/build.mjs`.

## Workflow

- Work is tracked in GitHub Issues; branch per issue, PR into `main`.
- Run `npm run check` before opening a PR (CI runs the same plus `format:check`).
