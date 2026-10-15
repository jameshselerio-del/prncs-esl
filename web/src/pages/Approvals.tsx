import { useState } from 'react';
import { useApi, useQuery } from '../api';

export function Approvals() {
  const api = useApi();
  const pending = useQuery('pendingApprovals');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    const note = decision === 'REJECTED' ? window.prompt('Reason for rejecting (optional):') : '';
    if (note === null) return;
    setBusyId(id);
    setError(null);
    try {
      await api('decideRequest', { id, decision, note });
      pending.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h2>Pending approvals</h2>
      {error && <p className="error">{error}</p>}
      {pending.error && <p className="error">{pending.error}</p>}
      {!pending.data ? (
        <p>Loading…</p>
      ) : pending.data.length === 0 ? (
        <p>Nothing waiting for you.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Dates</th>
                <th>Days</th>
                <th>Reason</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.requesterName}</td>
                  <td>{r.type}</td>
                  <td>{r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}</td>
                  <td>{r.days}</td>
                  <td>{r.reason}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={busyId === r.id}
                      onClick={() => decide(r.id, 'APPROVED')}
                    >
                      Approve
                    </button>
                    <button type="button" disabled={busyId === r.id} onClick={() => decide(r.id, 'REJECTED')}>
                      Reject
                    </button>
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
