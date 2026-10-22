import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { StudentBooking } from '../../../../shared/api';
import { MAX_CLASSES_PER_BOOKING } from '../../../../shared/slots';
import type { Slot } from '../../../../shared/types';
import { levelLabel } from '../../../../shared/validation';
import { useApi, useQuery } from '../../api';
import { Bilingual, Loading } from '../../brand';
import { InfoTip, Tr } from '../../hints';
import { ErrorText } from '../../components/Bits';
import { Modal } from '../../components/Modal';
import { useSession } from '../../session';
import { fmtDayHeading, fmtMonth, fmtRange, fmtTime, localDateKey } from '../../time';

interface Props {
  /** The student's current upcoming confirmed classes, for the per-student limit. */
  upcoming: number;
  onBooked: (bookings: StudentBooking[]) => void;
}

type View = 'list' | 'calendar';
const VIEW_KEY = 'bookView';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list';
  } catch {
    return 'list';
  }
}

const overlaps = (a: Slot, b: Slot) =>
  Date.parse(a.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(a.end);

/**
 * Open slots in the student's time zone, by day (list) or month (calendar). Students tap one or
 * more times, then confirm them together, choosing a lesson for each.
 */
export function BookingPicker({ upcoming, onBooked }: Props) {
  const api = useApi();
  const { user, settings } = useSession();
  const slots = useQuery('availability');
  const lessons = useQuery('lessons');
  const [view, setView] = useState<View>(readView);
  const [day, setDay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Slot[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [lessonFor, setLessonFor] = useState<Record<string, string>>({});
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Remembering the view is only a convenience.
    }
  }, [view]);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots.data ?? []) {
      const key = localDateKey(s.start, user.timeZone);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots.data, user.timeZone]);
  const dayKeys = [...days.keys()];
  const activeKey = day && days.has(day) ? day : dayKeys[0];
  const activeSlots = activeKey ? (days.get(activeKey) ?? []) : [];
  const left = Math.max(0, Math.min(settings.maxUpcomingPerStudent - upcoming, MAX_CLASSES_PER_BOOKING));
  const atLimit = upcoming >= settings.maxUpcomingPerStudent;
  const chosenOn = (key: string) => chosen.filter((s) => localDateKey(s.start, user.timeZone) === key).length;

  function toggle(slot: Slot) {
    setError(null);
    setChosen((current) =>
      current.some((s) => s.start === slot.start)
        ? current.filter((s) => s.start !== slot.start)
        : [...current, slot].sort((a, b) => a.start.localeCompare(b.start)),
    );
  }

  function unavailable(slot: Slot): string | null {
    if (chosen.some((s) => s.start === slot.start)) return null;
    if (chosen.length >= left) return 'limit';
    if (chosen.some((s) => overlaps(s, slot))) return 'overlap';
    return null;
  }

  async function book(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const booked = await api('bookClasses', {
        items: chosen.map((s) => ({ start: s.start, lessonId: lessonFor[s.start] || null })),
        topic,
        studentNote: note,
      });
      setChosen([]);
      setLessonFor({});
      setTopic('');
      setNote('');
      setConfirming(false);
      slots.reload();
      onBooked(booked);
    } catch (err) {
      setError((err as Error).message);
      slots.reload();
    } finally {
      setBusy(false);
    }
  }

  const n = chosen.length;
  const classes = (count: number) => `${count} class${count === 1 ? '' : 'es'}`;

  return (
    <>
      {atLimit ? (
        <p className="notice">
          You have {upcoming} upcoming classes, the most you can hold at once. You can book again after one of them.
        </p>
      ) : (
        <p className="hint">
          Tap one or more times, then book them together. You can choose up to {classes(left)} now.{' '}
          <InfoTip id="book.howTo" />
        </p>
      )}
      <ErrorText error={slots.error} />

      {!slots.data ? (
        <Loading label="Loading open times…" />
      ) : dayKeys.length === 0 ? (
        <p className="empty">No open times in the next {settings.bookingWindowDays} days. Please check back later.</p>
      ) : (
        <>
          <div className="segmented book-view-tabs" role="tablist" aria-label="Show open times as">
            {(['list', 'calendar'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={view === v ? 'active' : ''}
                onClick={() => setView(v)}
              >
                {v === 'list' ? 'List' : 'Calendar'}
                <Tr id={v === 'list' ? 'book.list' : 'book.calendar'} />
              </button>
            ))}
          </div>

          <div className={`booker ${view}`}>
            {view === 'list' ? (
              <div className="day-strip" role="tablist" aria-label="Days with open times">
                {dayKeys.map((key) => {
                  const list = days.get(key)!;
                  const picked = chosenOn(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={activeKey === key}
                      className={activeKey === key ? 'active' : ''}
                      onClick={() => setDay(key)}
                    >
                      <span>{fmtDayHeading(list[0].start, user.timeZone)}</span>
                      <span className="hint">
                        {list.length} open{picked ? ` · ${picked} chosen` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <MonthCalendar days={days} activeKey={activeKey} chosenOn={chosenOn} onPick={setDay} />
            )}

            {activeKey && (
              <div className="slot-panel">
                <h3>{fmtDayHeading(activeSlots[0].start, user.timeZone)}</h3>
                <div
                  className="slot-grid"
                  role="group"
                  aria-label={`Open times, ${fmtDayHeading(activeSlots[0].start, user.timeZone)}`}
                >
                  {activeSlots.map((s) => {
                    const selected = chosen.some((c) => c.start === s.start);
                    const blocked = unavailable(s);
                    return (
                      <button
                        key={s.start}
                        type="button"
                        className={selected ? 'slot selected' : 'slot'}
                        aria-pressed={selected}
                        disabled={atLimit || blocked !== null}
                        title={
                          blocked === 'overlap'
                            ? 'Overlaps a time you chose'
                            : blocked === 'limit'
                              ? 'You have chosen as many classes as you can book'
                              : undefined
                        }
                        onClick={() => toggle(s)}
                      >
                        {fmtTime(s.start, user.timeZone)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <section className="booking-tray" aria-label="Chosen times">
            {n === 0 ? (
              <span className="hint">
                No times chosen yet.
                <Tr id="book.noneChosen" />
              </span>
            ) : (
              <ul>
                {chosen.map((s) => (
                  <li key={s.start}>
                    {fmtRange(s.start, s.end, user.timeZone)}
                    <button
                      type="button"
                      className="icon"
                      aria-label={`Remove ${fmtRange(s.start, s.end, user.timeZone)}`}
                      onClick={() => toggle(s)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="primary"
              disabled={n === 0}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              {n > 1 ? `Book ${classes(n)}` : 'Book class'}
              <Tr id="book.submit" />
            </button>
          </section>
        </>
      )}

      {confirming && (
        <Modal title={n > 1 ? `Confirm ${classes(n)}` : 'Confirm booking'} onClose={() => setConfirming(false)}>
          <form className="form" onSubmit={book}>
            <ul className="confirm-list">
              {chosen.map((s) => {
                const lesson = lessons.data?.find((l) => l.id === lessonFor[s.start]);
                return (
                  <li key={s.start}>
                    <strong>{fmtRange(s.start, s.end, user.timeZone)}</strong>
                    <label>
                      <span>
                        Lesson <InfoTip id="book.lessonTip" />
                      </span>
                      <Tr id="book.lesson" />
                      <select
                        value={lessonFor[s.start] ?? ''}
                        onChange={(e) => setLessonFor((m) => ({ ...m, [s.start]: e.target.value }))}
                      >
                        <option value="">Let my teacher choose</option>
                        {(lessons.data ?? []).map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                            {l.level ? ` (${levelLabel(l.level)})` : ''}
                          </option>
                        ))}
                      </select>
                      {lesson?.summary && <span className="hint">{lesson.summary}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
            <label>
              What would you like to focus on? (optional)
              <Tr id="book.focus" />
              <input
                maxLength={200}
                placeholder="e.g. job interview practice"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
            </label>
            <label>
              Note for your teacher (optional)
              <Tr id="book.note" />
              <textarea maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {n > 1 && <p className="hint">The focus and note apply to every class you're booking.</p>}
            <ErrorText error={error} />
            <div className="actions">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Booking…' : <Bilingual en={n > 1 ? `Book ${classes(n)}` : 'Book class'} ja="予約確定" />}
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Back
                <Tr id="book.back" />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

/** A month grid of the booking window: days with open times can be picked. */
function MonthCalendar({
  days,
  activeKey,
  chosenOn,
  onPick,
}: {
  days: Map<string, Slot[]>;
  activeKey: string | undefined;
  chosenOn: (key: string) => number;
  onPick: (key: string) => void;
}) {
  const keys = [...days.keys()];
  const months = [...new Set(keys.map((k) => k.slice(0, 7)))];
  const [month, setMonth] = useState(() => (activeKey ?? keys[0]).slice(0, 7));
  const index = Math.max(0, months.indexOf(month));
  const [year, mon] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];

  return (
    <div className="book-calendar">
      <div className="book-calendar-nav">
        <button
          type="button"
          className="icon"
          aria-label="Previous month"
          disabled={index === 0}
          onClick={() => setMonth(months[index - 1])}
        >
          ‹
        </button>
        <strong>{fmtMonth(year, mon - 1)}</strong>
        <button
          type="button"
          className="icon"
          aria-label="Next month"
          disabled={index >= months.length - 1}
          onClick={() => setMonth(months[index + 1])}
        >
          ›
        </button>
      </div>
      <div className="book-calendar-grid" role="grid" aria-label={`Open days, ${fmtMonth(year, mon - 1)}`}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="weekday" role="columnheader">
            {w}
          </span>
        ))}
        {cells.map((key, i) => {
          if (!key) return <span key={`blank-${i}`} />;
          const open = days.get(key)?.length ?? 0;
          const picked = chosenOn(key);
          const date = Number(key.slice(8));
          return open ? (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={`day open${key === activeKey ? ' active' : ''}`}
              aria-selected={key === activeKey}
              aria-label={`${fmtMonth(year, mon - 1).split(' ')[0]} ${date}: ${open} open${picked ? `, ${picked} chosen` : ''}`}
              onClick={() => onPick(key)}
            >
              <span className="date">{date}</span>
              <span className="count">{open} open</span>
              {picked > 0 && <span className="picked">{picked}</span>}
            </button>
          ) : (
            <span key={key} role="gridcell" className="day" aria-disabled="true">
              <span className="date">{date}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
