// `npm run dev:mock`: builds the backend, then serves the mock API (scripts/mock-backend)
// and Vite in "mock" mode, whose .env.mock points VITE_API_URL at the mock API.
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

execFileSync(process.execPath, ['backend/build.mjs'], { stdio: 'inherit' });
await import('./mock-backend/server.mjs');

const vite = await createServer({ mode: 'mock' });
await vite.listen();
vite.printUrls();
vite.bindCLIShortcuts({ print: true });
