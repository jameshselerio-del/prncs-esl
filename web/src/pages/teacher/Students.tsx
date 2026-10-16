import { useState } from 'react';
import type { StudentSummary } from '../../../../shared/api';
import { levelLabel } from '../../../../shared/validation';
import { useApi, useQuery } from '../../api';
import { ErrorText } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { fmtDate } from '../../time';
import { Loading } from '../../brand';

export function Students() {
  const students = useQuery('students');
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StudentSummary | null>(null);

  const query = search.trim().toLowerCase();
  const visible = (students.data ?? []).filter(
    (s) => !query || `${s.name} ${s.email} ${s.nativeLanguage}`.toLowerCase().includes(query),
  );

  return (
    <>
      <h2>Students</h2>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, email or language"
          aria-label="Search students"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {students.data && (
          <span className="hint">
            {visible.length} of {students.data.length}
          </span>
        )}
      </div>
      <ErrorText error={students.error} />
      {!students.data ? (
        <Loading />
      ) : students.data.length === 0 ? (
        <p className="empty">No students yet. They appear here after signing in for the first time.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Level</th>
                <th>Time zone</th>
                <th>Upcoming</th>
                <th>Completed</th>
                <th>Last class</th>
                <th>
                  <span className="visually-hidden">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.email} className={s.active ? '' : 'inactive'}>
                  <td>
                    {s.name}
                    <div className="hint">
                      {s.email}
                      {!s.active && ' · deactivated'}
                    </div>
                  </td>
                  <td>{levelLabel(s.level) || '—'}</td>
                  <td>{s.timeZone}</td>
                  <td>{s.upcoming}</td>
                  <td>{s.completed}</td>
                  <td>{s.lastClass ? fmtDate(s.lastClass, user.timeZone) : '—'}</td>
                  <td>
                    <button type="button" onClick={() => setSelected(s)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <StudentDetail
          student={selected}
          onClose={() => setSelected(null)}
          onChanged={(s) => {
            setSelected(s);
            students.reload();
          }}
        />
      )}
    </>
  );
}

function StudentDetail({
  student: s,
  onClose,
  onChanged,
}: {
  student: StudentSummary;
  onClose: () => void;
  onChanged: (s: StudentSummary) => void;
}) {
  const api = useApi();
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (s.active && !window.confirm(`Deactivate ${s.name}? They won't be able to sign in or book.`)) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api('setStudentActive', { email: s.email, active: !s.active });
      onChanged({ ...s, ...updated });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={s.name} onClose={onClose}>
      <dl className="details">
        <dt>Email</dt>
        <dd>{s.email}</dd>
        <dt>Level</dt>
        <dd>{levelLabel(s.level) || '—'}</dd>
        <dt>Native language</dt>
        <dd>{s.nativeLanguage || '—'}</dd>
        <dt>Time zone</dt>
        <dd>{s.timeZone}</dd>
        <dt>Goals</dt>
        <dd>{s.goals || '—'}</dd>
        <dt>Contact</dt>
        <dd>{s.contact || '—'}</dd>
        <dt>Joined</dt>
        <dd>{s.createdAt ? fmtDate(s.createdAt, user.timeZone) : '—'}</dd>
        <dt>Classes</dt>
        <dd>
          {s.upcoming} upcoming · {s.completed} completed · {s.noShows} no-show · {s.cancelled} cancelled
        </dd>
      </dl>
      <ErrorText error={error} />
      <button type="button" className={s.active ? 'danger' : 'primary'} disabled={busy} onClick={toggle}>
        {s.active ? 'Deactivate student' : 'Reactivate student'}
      </button>
    </Modal>
  );
}
