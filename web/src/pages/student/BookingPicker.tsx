import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { StudentBooking } from '../../../../shared/api';
import type { Slot } from '../../../../shared/types';
import { useApi, useQuery } from '../../api';
import { Bilingual } from '../../brand';
import { ErrorText } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { fmtDayHeading, fmtRange, fmtTime, localDateKey } from '../../time';

/** Days shown by the compact picker on Home; the Book page shows the whole booking window. */
const COMPACT_DAYS = 7;

interface Props {
  /** The student's current upcoming confirmed classes, for the per-student limit. */
  upcoming: number;
  onBooked: (booking: StudentBooking) => void;
  /** Home page variant: a horizontal row of the next few days and a link to all times. */
  compact?: boolean;
}

/** Open slots grouped by day in the student's time zone, with a confirm dialog. */
export function BookingPicker({ upcoming, onBooked, compact = false }: Props) {
  const api = useApi();
  const { user, settings } = useSession();
  const slots = useQuery('availability');
  const [day, setDay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allDays = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) {
      const key = localDateKey(s.start, user.timeZone);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots.data, user.timeZone]);
  const days = compact ? allDays.slice(0, COMPACT_DAYS) : allDays;
  const activeDay = days.find(([key]) => key === day) ?? days[0];
  const atLimit = upcoming >= settings.maxUpcomingPerStudent;

  async function book(e: FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const booking = await api('book', { start: chosen.start, topic, studentNote: note });
      setChosen(null);
      setTopic('');
      setNote('');
      slots.reload();
      onBooked(booking);
    } catch (err) {
      setError((err as Error).message);
      slots.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {atLimit && (
        <p className="notice">
          You have {upcoming} upcoming classes, the most you can hold at once. You can book again after one of them.
        </p>
      )}
      <ErrorText error={slots.error} />

      {!slots.data ? (
        <p>Loading availability…</p>
      ) : days.length === 0 ? (
        <p className="empty">No open times in the next {settings.bookingWindowDays} days. Please check back later.</p>
      ) : (
        <div className={compact ? 'booker compact' : 'booker'}>
          <div className="day-strip" role="tablist" aria-label="Days with open times">
            {days.map(([key, list]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeDay?.[0] === key}
                className={activeDay?.[0] === key ? 'active' : ''}
                onClick={() => setDay(key)}
              >
                <span>{fmtDayHeading(list[0].start, user.timeZone)}</span>
                <span className="hint">{list.length} open</span>
              </button>
            ))}
          </div>
          {activeDay && (
            <div
              className="slot-grid"
              role="tabpanel"
              aria-label={`Open times, ${fmtDayHeading(activeDay[1][0].start, user.timeZone)}`}
            >
              {activeDay[1].map((s) => (
                <button
                  key={s.start}
                  type="button"
                  className="slot"
                  disabled={atLimit}
                  onClick={() => {
                    setError(null);
                    setChosen(s);
                  }}
                >
                  {fmtTime(s.start, user.timeZone)}
                </button>
              ))}
            </div>
          )}
          {compact && allDays.length > COMPACT_DAYS && (
            <Link to="/book" className="more-times">
              See all open times →
            </Link>
          )}
        </div>
      )}

      {chosen && (
        <Modal title="Confirm booking" onClose={() => setChosen(null)}>
          <form className="form" onSubmit={book}>
            <p>
              <strong>{fmtRange(chosen.start, chosen.end, user.timeZone)}</strong>
            </p>
            <label>
              What would you like to focus on? (optional)
              <input
                maxLength={200}
                placeholder="e.g. job interview practice"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </label>
            <label>
              Note for your teacher (optional)
              <textarea maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <ErrorText error={error} />
            <div className="actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Booking…' : <Bilingual en="Book class" ja="予約確定" />}
              </button>
              <button type="button" onClick={() => setChosen(null)}>
                Back
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
