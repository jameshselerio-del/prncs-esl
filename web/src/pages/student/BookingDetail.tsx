import { useState } from 'react';
import type { StudentBooking } from '../../../../shared/api';
import { canStudentCancel } from '../../../../shared/slots';
import type { Lesson } from '../../../../shared/types';
import { useApi } from '../../api';
import { ErrorText, ExternalLink, LessonCard, RichText, StatusBadge } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { fmtRange, relative } from '../../time';
import { Tr } from '../../hints';

interface Props {
  booking: StudentBooking;
  lessons: Map<string, Lesson>;
  onClose: () => void;
  onChanged: () => void;
}

export function BookingDetail({ booking: b, lessons, onClose, onChanged }: Props) {
  const api = useApi();
  const { user, settings, now } = useSession();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lesson = b.lessonId ? lessons.get(b.lessonId) : undefined;
  const upcoming = b.status === 'CONFIRMED' && Date.parse(b.end) > now;
  const cancellable = canStudentCancel(b, new Date(now), settings);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api('cancelBooking', { id: b.id, reason });
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={lesson?.title || b.topic || 'English class'} onClose={onClose}>
      <p>
        <StatusBadge status={b.status} /> {fmtRange(b.start, b.end, user.timeZone)}
        {upcoming && <span className="hint"> · {relative(b.start, now)}</span>}
      </p>

      {upcoming && (
        <p>
          {b.meetingLink ? (
            <ExternalLink href={b.meetingLink}>
              Join class
              <Tr id="class.join" />
            </ExternalLink>
          ) : (
            <span className="hint">Your teacher will add the meeting link before class.</span>
          )}
        </p>
      )}

      <dl className="details">
        {b.topic && (
          <>
            <dt>Topic</dt>
            <dd>{b.topic}</dd>
          </>
        )}
        {b.studentNote && (
          <>
            <dt>Your note</dt>
            <dd>{b.studentNote}</dd>
          </>
        )}
        {b.materials && (
          <>
            <dt>Materials</dt>
            <dd>
              <RichText text={b.materials} />
            </dd>
          </>
        )}
        {b.feedback && (
          <>
            <dt>Teacher feedback</dt>
            <dd>
              <RichText text={b.feedback} />
            </dd>
          </>
        )}
        {b.status === 'CANCELLED' && b.cancelReason && (
          <>
            <dt>Cancellation reason</dt>
            <dd>{b.cancelReason}</dd>
          </>
        )}
      </dl>

      {lesson && <LessonCard lesson={lesson} open />}

      {upcoming &&
        (cancellable ? (
          confirming ? (
            <div className="form">
              <label>
                Reason (optional)
                <input maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="danger" disabled={busy} onClick={cancel}>
                  {busy ? 'Cancelling…' : 'Confirm cancellation'}
                  <Tr id="class.confirmCancel" />
                </button>
                <button type="button" onClick={() => setConfirming(false)}>
                  Keep class
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)}>
              Cancel class
              <Tr id="class.cancel" />
            </button>
          )
        ) : (
          <p className="hint">
            Classes can be cancelled up to {settings.cancelNoticeHours} hours before they start. Contact your teacher if
            you can't attend.
          </p>
        ))}
      <ErrorText error={error} />
    </Modal>
  );
}
