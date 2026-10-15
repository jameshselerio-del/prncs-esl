import { useState, type FormEvent } from 'react';
import type { TeacherBooking, UpdateBookingPayload } from '../../../../shared/api';
import { canRecordOutcome, canTeacherCancel } from '../../../../shared/slots';
import type { Lesson } from '../../../../shared/types';
import { bookingDetailsErrors } from '../../../../shared/validation';
import { useApi } from '../../api';
import { ErrorText, ExternalLink, StatusBadge } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { fmtRange } from '../../time';

interface Props {
  booking: TeacherBooking;
  lessons: Lesson[];
  onClose: () => void;
  onChanged: () => void;
}

export function BookingEditor({ booking: b, lessons, onClose, onChanged }: Props) {
  const api = useApi();
  const { user, now } = useSession();
  const [form, setForm] = useState({
    lessonId: b.lessonId ?? '',
    topic: b.topic,
    meetingLink: b.meetingLink,
    materials: b.materials,
    feedback: b.feedback,
    privateNote: b.privateNote,
  });
  const [cancelReason, setCancelReason] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const details = { ...form, lessonId: form.lessonId || null };
  const problems = bookingDetailsErrors(details);
  const t = new Date(now);

  async function run(fn: () => Promise<unknown>, close = false) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      if (close) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = (status?: UpdateBookingPayload['status']) =>
    run(
      () => api('updateBooking', { id: b.id, ...details, lessonId: form.lessonId, status } as UpdateBookingPayload),
      true,
    );

  function submit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  return (
    <Modal title={`${b.studentName} · class`} onClose={onClose}>
      <p>
        <StatusBadge status={b.status} /> {fmtRange(b.start, b.end, user.timeZone)}
      </p>
      <p className="hint">
        {b.studentEmail}
        {b.status === 'CANCELLED' && b.cancelledBy && (
          <>
            {' '}
            · cancelled by {b.cancelledBy === b.studentEmail ? 'student' : 'you'}
            {b.cancelReason && `: ${b.cancelReason}`}
          </>
        )}
      </p>
      {b.studentNote && (
        <dl className="details">
          <dt>Student's note</dt>
          <dd>{b.studentNote}</dd>
        </dl>
      )}

      <form className="form" onSubmit={submit}>
        <label>
          Lesson
          <select value={form.lessonId} onChange={(e) => set('lessonId')(e.target.value)}>
            <option value="">— None —</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic
          <input maxLength={200} value={form.topic} onChange={(e) => set('topic')(e.target.value)} />
        </label>
        <label>
          Meeting link
          <input
            type="url"
            placeholder="https://"
            value={form.meetingLink}
            onChange={(e) => set('meetingLink')(e.target.value)}
          />
          {form.meetingLink && <ExternalLink href={form.meetingLink}>Open link</ExternalLink>}
        </label>
        <label>
          Materials (visible to student)
          <textarea maxLength={2000} value={form.materials} onChange={(e) => set('materials')(e.target.value)} />
        </label>
        <label>
          Feedback (visible to student)
          <textarea maxLength={5000} value={form.feedback} onChange={(e) => set('feedback')(e.target.value)} />
        </label>
        <label>
          Private note (only you see this)
          <textarea maxLength={5000} value={form.privateNote} onChange={(e) => set('privateNote')(e.target.value)} />
        </label>
        {problems.length > 0 && <ErrorText error={problems.join('\n')} />}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || problems.length > 0}>
            Save
          </button>
          {canRecordOutcome(b, t) && (
            <>
              <button type="button" disabled={busy || problems.length > 0} onClick={() => save('COMPLETED')}>
                Save &amp; mark completed
              </button>
              <button type="button" disabled={busy || problems.length > 0} onClick={() => save('NO_SHOW')}>
                Mark no-show
              </button>
            </>
          )}
        </div>
      </form>

      {canTeacherCancel(b, t) &&
        (confirmCancel ? (
          <div className="form danger-zone">
            <label>
              Reason (sent to the student)
              <input maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
            </label>
            <div className="actions">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => run(() => api('cancelBooking', { id: b.id, reason: cancelReason }), true)}
              >
                Confirm cancellation
              </button>
              <button type="button" onClick={() => setConfirmCancel(false)}>
                Keep class
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="link danger-text" onClick={() => setConfirmCancel(true)}>
            Cancel this class…
          </button>
        ))}
      <ErrorText error={error} />
    </Modal>
  );
}
