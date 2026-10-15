# PRNCS Leaves Tracking

Leave filing, approval and balance tracking for the Philippines and Japan
offices. Static React app on GitHub Pages, backed by a Google Apps Script API
that stores data in a Google Sheet in Drive.

- Requirements: [docs/requirements.md](docs/requirements.md)
- Architecture: [docs/architecture.md](docs/architecture.md)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in VITE_GOOGLE_CLIENT_ID and VITE_API_URL
npm run dev                  # http://localhost:5173
```

| Command                | What it does                                          |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Start the SPA dev server                              |
| `npm test`             | Unit tests (Vitest) for `shared/` domain logic        |
| `npm run check`        | Lint, typecheck, test and build — run before PRs      |
| `npm run build`        | Build SPA to `dist/web` and backend to `dist/backend` |
| `npm run backend:push` | Bundle backend and push it to Apps Script with clasp  |

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

1. `npx clasp login`, then `npx clasp create --type standalone --title "PRNCS Leaves API" --rootDir dist/backend`
   (or copy `.clasp.json.example` to `.clasp.json` and paste an existing script ID).
2. `npm run backend:push`.
3. In the Apps Script editor → **Project Settings → Script properties**, add:
   - `GOOGLE_CLIENT_ID` — same value as `VITE_GOOGLE_CLIENT_ID`
   - `APP_URL` — the GitHub Pages URL (used in emails)
4. Run `setupDatabase` once (creates the database Sheet in your Drive and
   saves `SPREADSHEET_ID`), then `installTriggers` once (daily job that grants
   yearly credits).
5. **Deploy → New deployment → Web app**, execute as _Me_, access _Anyone_.
   Put the `/exec` URL in `.env.local` as `VITE_API_URL`.
6. Add yourself as the first user: a row in the `Users` tab, e.g.
   `you@example.com | Your Name | PH | ADMIN | | REGULAR | 2026-01-01 | 1,2,3,4,5 | TRUE`.
   Add PH/JP public holidays to the `Holidays` tab.

After later backend changes: `npm run backend:push`, then **Deploy → Manage
deployments → Edit → New version** so the same `/exec` URL serves the new code.

### 3. GitHub Pages

GitHub Pages on a **private** repository needs a paid GitHub plan; otherwise
make the repository public.

1. **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add
   `VITE_GOOGLE_CLIENT_ID` and `VITE_API_URL`.
3. Push to `main`; `.github/workflows/deploy-pages.yml` builds and deploys.
