import { useMemo, useState, type FormEvent } from 'react';
import type { UserRecord } from '../../../../shared/api';
import type { User, Weekday } from '../../../../shared/types';
import {
  formatWorkingDays,
  OFFICES,
  parseWorkingDays,
  ROLES,
  STATUSES,
  userFromRecord,
  validateDirectory,
  WEEKDAY_NAMES,
} from '../../../../shared/users';
import { useApi } from '../../api';

export function toRecord(u: User): UserRecord {
  return {
    email: u.email,
    name: u.name,
    office: u.office,
    role: u.role,
    managerEmail: u.managerEmail ?? '',
    status: u.status,
    regularizedOn: u.regularizedOn ?? '',
    workingDays: formatWorkingDays(u.workingDays),
    active: u.active ? 'TRUE' : 'FALSE',
  };
}

export const NEW_USER: UserRecord = {
  email: '',
  name: '',
  office: 'PH',
  role: 'EMPLOYEE',
  managerEmail: '',
  status: 'PROBATIONARY',
  regularizedOn: '',
  workingDays: '1,2,3,4,5',
  active: 'TRUE',
};

interface Props {
  initial: UserRecord;
  isNew: boolean;
  users: User[];
  onSaved: () => void;
  onCancel: () => void;
}

export function UserForm({ initial, isNew, users, onSaved, onCancel }: Props) {
  const api = useApi();
  const [form, setForm] = useState<UserRecord>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof UserRecord) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  const workingDays = parseWorkingDays(form.workingDays) ?? [];
  const toggleDay = (day: Weekday) =>
    set('workingDays')(
      formatWorkingDays(workingDays.includes(day) ? workingDays.filter((d) => d !== day) : [...workingDays, day]),
    );

  const managers = users.filter((u) => u.role !== 'EMPLOYEE' && u.email !== form.email.trim().toLowerCase());

  // Same checks the server runs, for instant feedback.
  const problems = useMemo(() => {
    const { user, errors } = userFromRecord(form);
    if (!form.email.trim()) return ['Email is required.'];
    const others = users.filter((u) => u.email !== (isNew ? '' : initial.email));
    return [...errors, ...(validateDirectory([...others, user], [user.email]).get(user.email) ?? [])];
  }, [form, users, isNew, initial.email]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api('saveUser', { user: form, isNew });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form panel" onSubmit={submit}>
      <h3>{isNew ? 'Add user' : `Edit ${initial.name}`}</h3>
      <label>
        Email
        <input
          type="email"
          required
          disabled={!isNew}
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
        />
        {!isNew && <span className="hint">Email can't be changed; it links the user's leave history.</span>}
      </label>
      <label>
        Name
        <input required value={form.name} onChange={(e) => set('name')(e.target.value)} />
      </label>
      <div className="row">
        <label>
          Office
          <select value={form.office} onChange={(e) => set('office')(e.target.value)}>
            {OFFICES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select value={form.role} onChange={(e) => set('role')(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Manager (approves their leave)
        <select value={form.managerEmail} onChange={(e) => set('managerEmail')(e.target.value)}>
          <option value="">— None (HR/Admin approves) —</option>
          {managers.map((m) => (
            <option key={m.email} value={m.email}>
              {m.name} ({m.email})
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          Status
          <select value={form.status} onChange={(e) => set('status')(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Regularized on
          <input type="date" value={form.regularizedOn} onChange={(e) => set('regularizedOn')(e.target.value)} />
        </label>
      </div>
      <fieldset className="days">
        <legend>Working days</legend>
        {WEEKDAY_NAMES.map((name, i) => (
          <label key={name} className="check">
            <input
              type="checkbox"
              checked={workingDays.includes(i as Weekday)}
              onChange={() => toggleDay(i as Weekday)}
            />
            {name}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input
          type="checkbox"
          checked={form.active === 'TRUE'}
          onChange={(e) => set('active')(e.target.checked ? 'TRUE' : 'FALSE')}
        />
        Active (can sign in)
      </label>

      {problems.length > 0 && (
        <ul className="error">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={saving || problems.length > 0}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
