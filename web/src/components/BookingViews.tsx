import { useMemo, useState } from 'react';
import type { StudentBooking } from '../../../shared/api';
import type { Lesson } from '../../../shared/types';
import { fmtDate, fmtDayHeading, fmtMonth, fmtTime, localDateKey } from '../time';
import { StatusBadge } from './Bits';
import { Tr, type HintId } from '../hints';

export type ViewBooking = StudentBooking & { studentName?: string };
export type BookingView = 'table' | 'calendar' | 'timeline';

const VIEW_KEY = 'bookingView';
const VIEWS: { id: BookingView; label: string; hint: HintId }[] = [
  { id: 'table', label: 'Table', hint: 'view.table' },
  { id: 'calendar', label: 'Calendar', hint: 'view.calendar' },
  { id: 'timeline', label: 'Timeline', hint: 'view.timeline' },
];

/** Remembers the chosen view per browser; falls back to the table when storage is unavailable. */
export function useBookingView(): [BookingView, (v: BookingView) => void] {
  const [view, setView] = useState<BookingView>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return VIEWS.some((v) => v.id === saved) ? (saved as BookingView) : 'table';
    } catch {
      return 'table';
    }
  });
  const choose = (v: BookingView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Not persisted; the in-memory choice still applies.
    }
  };
  return [view, choose];
}

export function ViewSwitcher({ view, onChange }: { view: BookingView; onChange: (v: BookingView) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="Booking view">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          className={view === v.id ? 'active' : ''}
          onClick={() => onChange(v.id)}
        >
          {v.label}
          <Tr id={v.hint} />
        </button>
      ))}
    </div>
  );
}

interface ViewProps {
  bookings: ViewBooking[];
  timeZone: string;
  lessons: Map<string, Lesson>;
  now: number;
  onSelect: (b: ViewBooking) => void;
  showStudent?: boolean;
}

const titleOf = (b: ViewBooking, lessons: Map<string, Lesson>) =>
  (b.lessonId && lessons.get(b.lessonId)?.title) || b.topic || 'English class';

export function BookingViews(props: ViewProps & { view: BookingView }) {
  if (props.bookings.length === 0 && props.view !== 'calendar') return <p className="empty">No classes to show.</p>;
  if (props.view === 'calendar') return <CalendarView {...props} />;
  if (props.view === 'timeline') return <TimelineView {...props} />;
  return <TableView {...props} />;
}

function TableView({ bookings, timeZone, lessons, onSelect, showStudent }: ViewProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            {showStudent && <th>Student</th>}
            <th>Lesson</th>
            <th>Status</th>
            <th>
              <span className="visually-hidden">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>{fmtDate(b.start, timeZone)}</td>
              <td className="nowrap">
                {fmtTime(b.start, timeZone)} – {fmtTime(b.end, timeZone)}
              </td>
              {showStudent && <td>{b.studentName}</td>}
              <td>{titleOf(b, lessons)}</td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td>
                <button type="button" onClick={() => onSelect(b)}>
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function CalendarView({ bookings, timeZone, lessons, now, onSelect, showStudent }: ViewProps) {
  const today = localDateKey(new Date(now).toISOString(), timeZone);
  const [cursor, setCursor] = useState(() => ({
    year: Number(today.slice(0, 4)),
    month: Number(today.slice(5, 7)) - 1,
  }));

  const byDay = useMemo(() => {
    const map = new Map<string, ViewBooking[]>();
    for (const b of [...bookings].sort((x, y) => x.start.localeCompare(y.start))) {
      const key = localDateKey(b.start, timeZone);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return map;
  }, [bookings, timeZone]);

  // Calendar arithmetic on plain dates (UTC) so it never shifts with the device zone.
  const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const gridStart = new Date(first.getTime() - first.getUTCDay() * 86_400_000);
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getTime() + i * 86_400_000));
  const weeks = days[35].getUTCMonth() === cursor.month ? 6 : 5;
  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(Date.UTC(year, month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  return (
    <div className="calendar">
      <div className="calendar-nav">
        <button type="button" aria-label="Previous month" onClick={() => move(-1)}>
          ‹
        </button>
        <strong>{fmtMonth(cursor.year, cursor.month)}</strong>
        <button type="button" aria-label="Next month" onClick={() => move(1)}>
          ›
        </button>
        <button
          type="button"
          className="link"
          onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 })}
        >
          Today
        </button>
      </div>
      <div className="calendar-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-head" role="columnheader">
            {d}
          </div>
        ))}
        {days.slice(0, weeks * 7).map((d) => {
          const key = d.toISOString().slice(0, 10);
          const items = byDay.get(key) ?? [];
          const outside = d.getUTCMonth() !== cursor.month;
          return (
            <div
              key={key}
              role="gridcell"
              className={`calendar-cell${outside ? ' outside' : ''}${key === today ? ' today' : ''}`}
            >
              <span className="calendar-day">{d.getUTCDate()}</span>
              {items.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`chip ${b.status.toLowerCase()}`}
                  title={`${fmtTime(b.start, timeZone)} ${showStudent ? (b.studentName ?? '') : titleOf(b, lessons)}`}
                  onClick={() => onSelect(b)}
                >
                  <span className="chip-time">{fmtTime(b.start, timeZone)}</span>
                  <span className="chip-label">{showStudent ? b.studentName : titleOf(b, lessons)}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineView({ bookings, timeZone, lessons, now, onSelect, showStudent }: ViewProps) {
  const sorted = [...bookings].sort((a, b) => a.start.localeCompare(b.start));
  const today = localDateKey(new Date(now).toISOString(), timeZone);
  const groups: { key: string; items: ViewBooking[] }[] = [];
  for (const b of sorted) {
    const key = localDateKey(b.start, timeZone);
    if (groups.at(-1)?.key === key) groups.at(-1)!.items.push(b);
    else groups.push({ key, items: [b] });
  }
  const firstUpcoming = sorted.find((b) => Date.parse(b.end) > now)?.id;

  return (
    <ol className="timeline">
      {groups.map((g) => (
        <li key={g.key} className="timeline-day">
          <h4>
            {fmtDayHeading(g.items[0].start, timeZone)}
            {g.key === today && <span className="tag">Today</span>}
          </h4>
          <ol>
            {g.items.map((b) => (
              <li key={b.id} className={`timeline-item ${b.status.toLowerCase()}`}>
                {b.id === firstUpcoming && <div className="now-marker">Now</div>}
                <span className="timeline-time">{fmtTime(b.start, timeZone)}</span>
                <button type="button" className="timeline-card" onClick={() => onSelect(b)}>
                  <strong>{titleOf(b, lessons)}</strong>
                  {showStudent && <span>{b.studentName}</span>}
                  <span className="hint">
                    {fmtTime(b.start, timeZone)} – {fmtTime(b.end, timeZone)}
                  </span>
                  <StatusBadge status={b.status} />
                </button>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
