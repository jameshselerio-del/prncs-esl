import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MeResult } from '../../../shared/api';
import { CREDIT_TYPES, validateNewRequest } from '../../../shared/policy';
import type { LeaveType } from '../../../shared/types';
import { useApi, useQuery } from '../api';

export function NewRequest({ me, onCreated }: { me: MeResult; onCreated: () => void }) {
  const api = useApi();
  const navigate = useNavigate();
  const holidays = useQuery('holidays');
  const myRequests = useQuery('myRequests');
  const [type, setType] = useState<LeaveType>(me.allowedTypes[0]);
  const [startDate, setStartDate] = useState(me.today);
  const [endDate, setEndDate] = useState(me.today);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same rules the server enforces, run locally for instant feedback. The server stays authoritative.
  const preview = useMemo(() => {
    if (!holidays.data || !myRequests.data || !startDate || !endDate) return null;
    try {
      return validateNewRequest({
        user: me.user,
        type,
        startDate,
        endDate,
        today: me.today,
        holidays: holidays.data,
        existing: myRequests.data,
        balance: me.credits.available,
      });
    } catch {
      return { ok: false as const, errors: ['Enter valid dates.'] };
    }
  }, [me, type, startDate, endDate, holidays.data, myRequests.data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('createRequest', { type, startDate, endDate, reason });
      onCreated();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>File a leave</h2>
      <label>
        Leave type
        <select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
          {me.allowedTypes.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
              {CREDIT_TYPES.has(t) ? ' (uses credits)' : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          From
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <label>
        Reason
        <textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      {preview &&
        (preview.ok ? (
          <p className="hint">
            {preview.days} working day{preview.days === 1 ? '' : 's'}
            {CREDIT_TYPES.has(type) && ` · ${me.credits.available - preview.days} credits left after approval`}
          </p>
        ) : (
          <ul className="error">
            {preview.errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ))}
      {error && <p className="error">{error}</p>}

      <button type="submit" className="primary" disabled={submitting || !preview?.ok}>
        {submitting ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
