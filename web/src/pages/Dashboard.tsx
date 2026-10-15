import { useState } from 'react';
import type { MeResult } from '../../../shared/api';
import { canCancel } from '../../../shared/policy';
import { useApi, useQuery } from '../api';

export function Dashboard({ me, onChange }: { me: MeResult; onChange: () => void }) {
  const api = useApi();
  const requests = useQuery('myRequests');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { credits, user } = me;

  async function cancel(id: string) {
    if (!window.confirm('Cancel this leave request?')) return;
    setBusyId(id);
    setError(null);
    try {
      await api('cancelRequest', { id });
      requests.reload();
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className="cards">
        <div className="card">
          <span className="label">Available credits {credits.year}</span>
          <span className="value">{credits.available}</span>
          {credits.reserved > 0 && <span className="hint">{credits.reserved} held by pending requests</span>}
        </div>
        <div className="card">
          <span className="label">Status</span>
          <span className="value small">{user.status === 'REGULAR' ? 'Regular' : 'Probationary'}</span>
          {user.status === 'PROBATIONARY' && <span className="hint">Unpaid and holiday leave only</span>}
        </div>
      </section>

      <h2>My requests</h2>
      {error && <p className="error">{error}</p>}
      {requests.error && <p className="error">{requests.error}</p>}
      {!requests.data ? (
        <p>Loading…</p>
      ) : requests.data.length === 0 ? (
        <p>No leave requests yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td>{r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}</td>
                  <td>{r.days}</td>
                  <td>
                    <span className={`badge ${r.status.toLowerCase()}`}>{r.status}</span>
                    {r.decisionNote && <div className="hint">{r.decisionNote}</div>}
                  </td>
                  <td>
                    {canCancel(r, me.today) && (
                      <button type="button" disabled={busyId === r.id} onClick={() => cancel(r.id)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
