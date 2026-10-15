// Local stand-in for the Apps Script web app: `node scripts/mock-backend/server.mjs`.
// POST / is forwarded to doPost. Data lives in memory and is re-seeded on restart.
//   GET  /__mock/identities  test identities for the SPA's identity switcher
//   GET  /__mock/mail        emails sent so far (e.g. password reset codes)
//   POST /__mock/reminders   runs the hourly sendReminders job now
//   POST /__mock/reset       wipes and re-seeds the data
// Rebuild the backend (npm run build:backend) and restart to pick up backend changes.
import { createServer } from 'node:http';
import { loadBackend } from './backend.mjs';
import { IDENTITIES, seed } from './seed.mjs';

const PORT = Number(process.env.MOCK_API_PORT) || 8787;

function freshBackend() {
  const backend = loadBackend();
  seed(backend);
  return backend;
}

let backend = freshBackend();

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    const route = `${req.method} ${new URL(req.url, 'http://localhost').pathname}`;
    try {
      switch (route) {
        case 'OPTIONS /':
        case 'OPTIONS /__mock/identities':
          return send(res, 204, '');
        case 'GET /':
          return send(res, 200, { ok: true, data: 'ESL Booking mock API' });
        case 'POST /': {
          let action = '?';
          try {
            action = JSON.parse(body).action;
          } catch {
            // doPost reports the malformed body itself.
          }
          const out = backend.post(body);
          console.log(`${action} → ${JSON.parse(out).ok ? 'ok' : JSON.parse(out).error}`);
          return send(res, 200, out);
        }
        case 'GET /__mock/identities':
          return send(res, 200, IDENTITIES);
        case 'GET /__mock/mail':
          return send(
            res,
            200,
            backend.state.mail.map(({ to, subject, body: text }) => ({ to, subject, body: text })),
          );
        case 'POST /__mock/reminders':
          backend.sendReminders();
          return send(res, 200, { ok: true });
        case 'POST /__mock/reset':
          backend = freshBackend();
          return send(res, 200, { ok: true });
        default:
          return send(res, 404, { ok: false, error: `No route ${route}` });
      }
    } catch (err) {
      console.error(err);
      return send(res, 500, { ok: false, error: String(err) });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Mock API on http://localhost:${PORT} — sign in with one of:`);
  for (const id of IDENTITIES) console.log(`  ${id.label}: ${id.token}`);
});
