import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Slot } from '../../../../shared/types';
import { useApi, useQuery } from '../../api';
import { ErrorText } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { Bilingual } from '../../brand';
import { fmtDayHeading, fmtRange, fmtTime, localDateKey } from '../../time';

export function Book() {
  const api = useApi();
  const navigate = useNavigate();
  const { user, settings, now } = useSession();
  const slots = useQuery('availability');
  const mine = useQuery('myBookings');
  const [day, setDay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) {
      const key = localDateKey(s.start, user.timeZone);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots.data, user.timeZone]);
  const activeDay = days.find(([key]) => key === day) ?? days[0];

  const upcoming = (mine.data ?? []).filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) > now).length;
  const atLimit = upcoming >= settings.maxUpcomingPerStudent;

  async function book(e: FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await api('book', { start: chosen.start, topic, studentNote: note });
      navigate('/bookings', { state: { booked: true } });
    } catch (err) {
      setError((err as Error).message);
      slots.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>
        Book a class{' '}
        <span className="hint ja" lang="ja">
          レッスン予約
        </span>
      </h2>
      <p className="hint">
        Classes are {settings.lessonMinutes} minutes. Times are shown in {user.timeZone}. You can cancel up to{' '}
        {settings.cancelNoticeHours} hours before a class.
      </p>
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
        <div className="booker">
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
            <div className="slot-grid">
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
