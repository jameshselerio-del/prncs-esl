import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ImportSummary } from '../../../../shared/api';
import { toCsv } from '../../../../shared/csv';
import { usersToCsv } from '../../../../shared/userImport';
import { USER_COLUMNS } from '../../../../shared/users';
import { useApi } from '../../api';

const TEMPLATE = toCsv([
  [...USER_COLUMNS],
  [
    'juan.delacruz@example.com',
    'Juan Dela Cruz',
    'PH',
    'EMPLOYEE',
    'manager@example.com',
    'PROBATIONARY',
    '',
    'Mon-Fri',
    'TRUE',
  ],
  ['hanako.sato@example.com', 'Hanako Sato', 'JP', 'MANAGER', '', 'REGULAR', '2025-04-01', '1,2,3,4,5', 'TRUE'],
]);

// The BOM makes Excel open the file as UTF-8, so Japanese names display correctly.
const BOM = String.fromCharCode(0xfeff);

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([BOM + content], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportUsers() {
  const api = useApi();
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after fixing it
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    setPreview(null);
    setResult(null);
    const summary = await run(() => api('importUsers', { csv: text, dryRun: true }));
    if (summary) setPreview(summary);
  }

  async function apply() {
    if (!csv) return;
    const summary = await run(() => api('importUsers', { csv, dryRun: false }));
    if (summary) {
      setResult(summary);
      setPreview(summary.applied ? null : summary);
    }
  }

  async function exportCurrent() {
    const users = await run(() => api('listUsers', {}));
    if (users) download('users.csv', usersToCsv(users));
  }

  const changes = preview ? preview.creates.length + preview.updates.length : 0;

  return (
    <>
      <div className="toolbar">
        <h2>Import users from CSV</h2>
        <Link to="/admin/users">← Back to users</Link>
      </div>

      <section className="panel form">
        <p>
          One row per employee. Rows whose email already exists update that user; other rows add new users. The import
          is <strong>all or nothing</strong>: if any row has an error, nothing is changed.
        </p>
        <ul className="hint">
          <li>
            Columns: <code>{USER_COLUMNS.join(', ')}</code>
          </li>
          <li>office: PH or JP · role: EMPLOYEE, MANAGER or ADMIN · status: PROBATIONARY or REGULAR</li>
          <li>regularizedOn: YYYY-MM-DD, required for REGULAR · managerEmail: blank or a MANAGER/ADMIN</li>
          <li>workingDays: e.g. Mon-Fri, Mon-Sat or 1,2,3,4,5 (0 = Sunday) · active: TRUE/FALSE, blank = TRUE</li>
        </ul>
        <div className="actions">
          <button type="button" onClick={() => download('users-template.csv', TEMPLATE)}>
            Download template
          </button>
          <button type="button" disabled={busy} onClick={exportCurrent}>
            Export current users
          </button>
        </div>
        <label>
          CSV file
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={onFile} />
        </label>
      </section>

      {busy && <p>Working…</p>}
      {error && <p className="error">{error}</p>}

      {result?.applied && (
        <p className="success">
          Imported: {result.creates.length} added, {result.updates.length} updated, {result.unchanged.length} unchanged.
        </p>
      )}

      {preview && (
        <section>
          <h3>Preview of {fileName}</h3>
          <p>
            {preview.creates.length} to add · {preview.updates.length} to update · {preview.unchanged.length} unchanged
          </p>
          {preview.errors.length > 0 ? (
            <>
              <p className="error">
                {preview.errors.length} problem{preview.errors.length === 1 ? '' : 's'} found. Fix the file and upload
                it again; nothing has been imported.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Email</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e, i) => (
                      <tr key={`${e.line}-${e.email}-${i}`}>
                        <td>{e.line === 0 ? '—' : e.line}</td>
                        <td>{e.email || '—'}</td>
                        <td>
                          {e.messages.map((m) => (
                            <div key={m}>{m}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : changes === 0 ? (
            <p>Nothing to change; every row matches the current users.</p>
          ) : (
            <>
              {preview.creates.length > 0 && <p className="hint">New: {preview.creates.join(', ')}</p>}
              {preview.updates.length > 0 && <p className="hint">Updated: {preview.updates.join(', ')}</p>}
              <button type="button" className="primary" disabled={busy} onClick={apply}>
                Import {changes} user{changes === 1 ? '' : 's'}
              </button>
            </>
          )}
        </section>
      )}
    </>
  );
}
