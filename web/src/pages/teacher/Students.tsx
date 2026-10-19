import { useMemo, useState, type FormEvent } from 'react';
import type { StudentSummary } from '../../../../shared/api';
import type { Level } from '../../../../shared/types';
import { hasEmail, LEVELS, levelLabel } from '../../../../shared/validation';
import { useApi, useQuery } from '../../api';
import { Loading } from '../../brand';
import { ErrorText } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { LoginCard, StudentLoginFields, suggestPassword } from '../../components/StudentLogin';
import { useSession } from '../../session';
import { fmtDate, timeZoneOptions } from '../../time';

const emailLabel = (email: string) => (hasEmail(email) ? email : 'No email');

export function Students() {
  const students = useQuery('students');
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [adding, setAdding] = useState(false);

  const query = search.trim().toLowerCase();
  const visible = (students.data ?? []).filter(
    (s) => !query || `${s.name} ${s.email} ${s.username ?? ''} ${s.nativeLanguage}`.toLowerCase().includes(query),
  );

  return (
    <>
      <div className="toolbar">
        <h2>Students</h2>
        <button type="button" className="primary" onClick={() => setAdding(true)}>
          Add student
        </button>
      </div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, username, email or language"
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
        <p className="empty">
          No students yet. They appear here after they sign up, or add one yourself with "Add student".
        </p>
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
                      {s.username ? `@${s.username} · ` : ''}
                      {emailLabel(s.email)}
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
      {adding && <AddStudent onClose={() => setAdding(false)} onAdded={() => students.reload()} />}
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
  const [settingLogin, setSettingLogin] = useState(false);

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
        <dd>{emailLabel(s.email)}</dd>
        <dt>Sign-in</dt>
        <dd>{s.username ? `Username "${s.username}"` : 'Google only (no password yet)'}</dd>
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
      {settingLogin ? (
        <SetLogin student={s} onDone={(username) => onChanged({ ...s, username })} />
      ) : (
        <div className="actions">
          <button type="button" onClick={() => setSettingLogin(true)}>
            {s.username ? 'Reset password' : 'Set username and password'}
          </button>
        </div>
      )}
      <ErrorText error={error} />
      <div className="actions">
        <button type="button" className={s.active ? 'danger' : 'primary'} disabled={busy} onClick={toggle}>
          {s.active ? 'Deactivate student' : 'Reactivate student'}
        </button>
      </div>
    </Modal>
  );
}

/** The teacher sets up a student who doesn't use Google (or email) themselves. */
function AddStudent({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const api = useApi();
  const { user } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(suggestPassword);
  const [timeZone, setTimeZone] = useState(user.timeZone);
  const [level, setLevel] = useState<Level | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const zones = useMemo(() => timeZoneOptions(timeZone), [timeZone]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const student = await api('createStudent', {
        name,
        email: email.trim(),
        username,
        password,
        timeZone,
        level,
        nativeLanguage: '',
        goals: '',
        contact: '',
      });
      setCreated({ name: student.name, username: student.username ?? username, password });
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add student" onClose={onClose}>
      {created ? (
        <>
          <p className="success" role="status">
            {created.name} can now sign in.
          </p>
          <LoginCard {...created} />
          <div className="actions">
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <p className="hint">
            For students who don't use Google. They sign in with the username and password you choose here.
          </p>
          <label>
            Name
            <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email (optional)
            <input type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            <span className="hint">
              Leave empty if they don't use email. They won't get class emails, and you reset their password if they
              forget it.
            </span>
          </label>
          <StudentLoginFields
            username={username}
            password={password}
            onUsername={setUsername}
            onPassword={setPassword}
          />
          <label>
            Time zone
            <select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <label>
            English level
            <select value={level} onChange={(e) => setLevel(e.target.value as Level | '')}>
              <option value="">Not sure</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <ErrorText error={error} />
          <div className="actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add student'}
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Sets or resets a student's username and password, then shows what to hand over. */
function SetLogin({ student, onDone }: { student: StudentSummary; onDone: (username: string) => void }) {
  const api = useApi();
  const [username, setUsername] = useState(student.username ?? '');
  const [password, setPassword] = useState(suggestPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ username: string; password: string } | null>(null);

  if (saved) return <LoginCard name={student.name} {...saved} />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api('setStudentLogin', { email: student.email, username, password });
      setSaved({ username: result.username, password });
      onDone(result.username);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} aria-label="Set username and password">
      <StudentLoginFields username={username} password={password} onUsername={setUsername} onPassword={setPassword} />
      {student.username && (
        <p className="hint">Their old password stops working, and they are signed out on other devices.</p>
      )}
      <ErrorText error={error} />
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
