# ESL Class Booking

A booking site where students book one-to-one ESL classes with a single
teacher. Static React app on GitHub Pages, backed by a Google Apps Script API
that stores data in a Google Sheet in the teacher's Drive.

- Requirements: [docs/requirements.md](docs/requirements.md)
- Architecture: [docs/architecture.md](docs/architecture.md)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in VITE_GOOGLE_CLIENT_ID and VITE_API_URL
npm run dev                  # http://localhost:5173
```

| Command                          | What it does                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run dev`                    | Start the SPA dev server                                                                         |
| `npm run dev:mock`               | SPA + local mock API, no Google sign-in (see below)                                              |
| `npm run mock-api`               | Only the mock API, on http://localhost:8787                                                      |
| `npm test`                       | Unit tests for `shared/` + backend end-to-end tests                                              |
| `npm run test:e2e`               | Playwright browser tests against the mock backend (first run: `npx playwright install chromium`) |
| `npm run check`                  | Lint, typecheck, test and build — run before PRs                                                 |
| `npm run build`                  | Build SPA to `dist/web` and backend to `dist/backend`                                            |
| `npm run backend:push`           | Bundle backend and push it to Apps Script with clasp                                             |
| `npm run dev:staging`            | SPA against the staging backend and Sheet                                                        |
| `npm run backend:deploy:staging` | Push and release the backend to staging                                                          |
| `npm run backend:deploy`         | Push, then release it on the production `/exec` URL                                              |

### Without Google: the mock API

```bash
npm run dev:mock             # http://localhost:5173, mock API on :8787
```

This builds the backend and runs the real `dist/backend/Code.js` in Node
(`scripts/mock-backend/`) with in-memory fakes of the Sheet, mail, cache, lock
and token check, seeded with a teacher (Asia/Manila), three students in other
time zones, weekday availability, lessons and bookings. The SPA runs in Vite's
`mock` mode (`.env.mock`): instead of the Google button it lets you pick a test
identity, and a switcher in the bottom-right corner changes identity while
signed in. Mock ID tokens are `email|Display Name`, so any email works; an
unknown one goes through sign-up.

Data lives in memory and is re-seeded on restart (or `POST /__mock/reset`).
Emails are printed to the terminal; `POST /__mock/reminders` runs the hourly
reminder job. After changing `backend/`, restart `dev:mock` to rebuild it.

`scripts/mock-backend/backend.test.mjs` uses the same harness for end-to-end
backend tests (sign-up, booking rules, cancelling, private notes, reminders,
deactivation, leave-tracking migration) as part of `npm test`.

## First-time setup

### 1. Google Cloud OAuth client (for Google Sign-In)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → OAuth consent screen**: configure it (External, or
   Internal if all users are in your Google Workspace).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized JavaScript origins: `http://localhost:5173` and
   `https://<your-github-user>.github.io`.
4. Copy the client ID into `.env.local` as `VITE_GOOGLE_CLIENT_ID`.

### 2. Apps Script backend

1. The Apps Script project already exists; `.clasp.json` links this repo to it.
   Run `npx clasp login` with a Google account that has edit access to the
   script (ask the owner to share it).
2. `npm run backend:push`.
3. In the Apps Script editor → **Project Settings → Script properties**, add:
   - `GOOGLE_CLIENT_ID` — same value as `VITE_GOOGLE_CLIENT_ID`
   - `APP_URL` (optional) — link used in emails; defaults to
     `https://jameshselerio-del.github.io/prncs-esl/`
4. Run `setupDatabase` once to approve the script's permissions. It creates the
   database Sheet in your Drive and saves `SPREADSHEET_ID` (on an existing
   leave-tracking Sheet it converts the Users tab and renames the old leave tabs
   to `old_…`). After that the backend keeps itself set up: the first request
   after a deploy upgrades the Sheet if needed and installs the hourly reminder
   trigger (`installTriggers` does the same by hand). Both are safe to re-run.
5. **Deploy → New deployment → Web app**, execute as _Me_, access _Anyone_.
   Put the `/exec` URL in `.env.local` as `VITE_API_URL`.
6. Make the teacher an admin: a row in the `Users` tab with role `ADMIN`, e.g.
   `teacher@gmail.com | Teacher Name | ADMIN | TRUE | Asia/Manila`.
   (A migrated leave-tracking admin is already an admin.) Students create their
   own accounts on first sign-in.
7. Sign in as the teacher and set weekly hours and booking settings under
   **Availability**, then add lessons under **Lessons**.

After later backend changes: `npm run backend:deploy`. It pushes the code and
updates the existing deployment to a new version, so the `/exec` URL stays the
same. (`backend:push` alone only updates the editor's draft, which the live URL
does not serve.)

### 3. Staging (for UAT)

A second Apps Script project with its own Sheet, so changes can be tried
without touching live data. `.clasp.staging.json` points at it.

One-time setup, in the [staging Apps Script editor](https://script.google.com/d/1BecIbcNnynVPoqLWcc1zAKpb0wvDuSFKRF28g0nb9c-4uMobLJED-NHt/edit):

1. **Project Settings → Script properties**:
   - `GOOGLE_CLIENT_ID` — same as production
   - `ENVIRONMENT` = `staging`
   - `ADMIN_EMAIL` — the Google account that acts as the teacher on staging
2. Run `seedDemoData` and approve the permissions. It creates the
   "ESL Class Booking — Database (staging)" Sheet with demo students
   (`@demo.invalid`, never emailed), weekday hours, lessons and bookings.
3. `npm run dev:staging` and sign in. Testers sign in with their own Google
   accounts and register as students.

Release a branch to staging with `npm run backend:deploy:staging`; it doesn't
affect production. Reminders are installed automatically there too; demo
students are never emailed.

### 4. GitHub Pages

GitHub Pages on a **private** repository needs a paid GitHub plan; otherwise
make the repository public.

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add
   `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL`.
3. Push to `main`; `.github/workflows/deploy-pages.yml` builds and deploys.
