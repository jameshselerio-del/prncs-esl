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

| Command                  | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Start the SPA dev server                              |
| `npm test`               | Unit tests (Vitest) for `shared/` domain logic        |
| `npm run check`          | Lint, typecheck, test and build — run before PRs      |
| `npm run build`          | Build SPA to `dist/web` and backend to `dist/backend` |
| `npm run backend:push`   | Bundle backend and push it to Apps Script with clasp  |
| `npm run backend:deploy` | Push, then release it on the production `/exec` URL   |

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
   - `APP_URL` — the GitHub Pages URL used in emails,
     `https://jameshselerio-del.github.io/prncs-esl/`
4. Run `setupDatabase` (creates the database Sheet in your Drive and saves
   `SPREADSHEET_ID`; on an existing leave-tracking Sheet it converts the Users
   tab and renames the old leave tabs to `old_…`). Then run `installTriggers`
   (hourly class-reminder emails). Both are safe to re-run.
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

### 3. GitHub Pages

GitHub Pages on a **private** repository needs a paid GitHub plan; otherwise
make the repository public.

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add
   `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL`.
3. Push to `main`; `.github/workflows/deploy-pages.yml` builds and deploys.
