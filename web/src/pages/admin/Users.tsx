import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { UserRecord } from '../../../../shared/api';
import { WEEKDAY_NAMES } from '../../../../shared/users';
import { useQuery } from '../../api';
import { NEW_USER, toRecord, UserForm } from './UserForm';

type Editing = { record: UserRecord; isNew: boolean } | null;

export function Users() {
  const users = useQuery('listUsers');
  const [editing, setEditing] = useState<Editing>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const all = users.data ?? [];
  const nameOf = (email: string | null) => all.find((u) => u.email === email)?.name ?? email ?? '—';
  const query = search.trim().toLowerCase();
  const visible = all.filter(
    (u) =>
      (showInactive || u.active) &&
      (!query || [u.name, u.email, u.office, u.role].some((v) => v.toLowerCase().includes(query))),
  );

  return (
    <>
      <div className="toolbar">
        <h2>Users</h2>
        <div className="actions">
          <Link to="/admin/users/import" className="button">
            Import CSV
          </Link>
          <button type="button" className="primary" onClick={() => setEditing({ record: NEW_USER, isNew: true })}>
            Add user
          </button>
        </div>
      </div>

      {editing && (
        <UserForm
          key={editing.record.email || 'new'}
          initial={editing.record}
          isNew={editing.isNew}
          users={all}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            users.reload();
          }}
        />
      )}

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, email, office, role"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {users.error && <p className="error">{users.error}</p>}
      {!users.data ? (
        <p>Loading…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Office</th>
                <th>Role</th>
                <th>Manager</th>
                <th>Status</th>
                <th>Working days</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr key={u.email} className={u.active ? '' : 'inactive'}>
                  <td>
                    {u.name}
                    <div className="hint">{u.email}</div>
                  </td>
                  <td>{u.office}</td>
                  <td>{u.role}</td>
                  <td>{nameOf(u.managerEmail)}</td>
                  <td>
                    {u.status === 'REGULAR' ? `Regular since ${u.regularizedOn}` : 'Probationary'}
                    {!u.active && <div className="hint">Inactive</div>}
                  </td>
                  <td>{u.workingDays.map((d) => WEEKDAY_NAMES[d]).join(' ')}</td>
                  <td>
                    <button type="button" onClick={() => setEditing({ record: toRecord(u), isNew: false })}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {visible.length} of {all.length} users
          </p>
        </div>
      )}
    </>
  );
}
