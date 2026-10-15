import { useState, type FormEvent } from 'react';
import { parseClock, TEACHER_TIME_ZONE, teacherWallToUtc } from '../../../../shared/time';
import { useApi, useQuery } from '../../api';
import { ErrorText } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { fmtTime, localDateKey } from '../../time';

/** Teacher books a class for a student at any free time; open slots are offered as suggestions. */
export function BookForStudent({ onClose, onBooked }: { onClose: () => void; onBooked: () => void }) {
  const api = useApi();
  const { now, settings } = useSession();
  const students = useQuery('students');
  const slots = useQuery('availability');
  const today = localDateKey(new Date(now).toISOString(), TEACHER_TIME_ZONE);
  const [form, setForm] = useState({ studentEmail: '', date: today, time: '', topic: '', studentNote: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const active = (students.data ?? []).filter((s) => s.active);
  const suggestions = (slots.data ?? []).filter((s) => localDateKey(s.start, TEACHER_TIME_ZONE) === form.date);
  const minutes = parseClock(form.time);
  const start = form.date && minutes !== null ? teacherWallToUtc(form.date, minutes).toISOString() : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!start) return;
    setBusy(true);
    setError(null);
    try {
      await api('bookForStudent', {
        studentEmail: form.studentEmail,
        start,
        topic: form.topic,
        studentNote: form.studentNote,
      });
      onBooked();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Book a class for a student" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Student
          <select required value={form.studentEmail} onChange={(e) => set('studentEmail')(e.target.value)}>
            <option value="">{students.data ? 'Choose a student' : 'Loading…'}</option>
            {active.map((s) => (
              <option key={s.email} value={s.email}>
                {s.name} ({s.email})
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label>
            Date ({TEACHER_TIME_ZONE})
            <input type="date" required min={today} value={form.date} onChange={(e) => set('date')(e.target.value)} />
          </label>
          <label>
            Start time
            <input type="time" required value={form.time} onChange={(e) => set('time')(e.target.value)} />
          </label>
        </div>
        {suggestions.length > 0 && (
          <div>
            <span className="hint">Open slots that day:</span>
            <div className="slot-grid compact">
              {suggestions.map((s) => {
                const value = fmtClock24(s.start);
                return (
                  <button
                    key={s.start}
                    type="button"
                    className={`slot${form.time === value ? ' selected' : ''}`}
                    onClick={() => set('time')(value)}
                  >
                    {fmtTime(s.start, TEACHER_TIME_ZONE)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <p className="hint">
          Any free time works, including outside your weekly hours. The class lasts {settings.lessonMinutes} minutes and
          the student gets a confirmation email.
        </p>
        <label>
          Topic (optional)
          <input maxLength={200} value={form.topic} onChange={(e) => set('topic')(e.target.value)} />
        </label>
        <label>
          Note (optional)
          <textarea maxLength={1000} value={form.studentNote} onChange={(e) => set('studentNote')(e.target.value)} />
        </label>
        <ErrorText error={error} />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || !form.studentEmail || !start}>
            {busy ? 'Booking…' : 'Book class'}
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** `HH:MM` (24-hour) of an instant in Manila time, for the time input. */
function fmtClock24(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TEACHER_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}
