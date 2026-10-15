import { useMemo, useState } from 'react';
import type { TeacherBooking } from '../../../../shared/api';
import { toCsv } from '../../../../shared/csv';
import { useQuery } from '../../api';
import { ErrorText } from '../../components/Bits';
import { BookingViews, useBookingView, ViewSwitcher } from '../../components/BookingViews';
import { useSession } from '../../session';
import { fmtDate, fmtTime, localDateKey } from '../../time';
import { BookingEditor } from './BookingEditor';

type Filter = 'upcoming' | 'past' | 'cancelled' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
];

// The BOM makes Excel open the file as UTF-8, so non-Latin names display correctly.
const BOM = String.fromCharCode(0xfeff);

export function TeacherBookings() {
  const { user, now } = useSession();
  const bookings = useQuery('allBookings');
  const lessons = useQuery('lessons');
  const [view, setView] = useBookingView();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lessonMap = useMemo(() => new Map((lessons.data ?? []).map((l) => [l.id, l])), [lessons.data]);

  const t = now;
  const all = bookings.data ?? [];
  const query = search.trim().toLowerCase();
  const visible = all
    .filter((b) => {
      const ended = Date.parse(b.end) <= t;
      if (filter === 'upcoming' && !(b.status === 'CONFIRMED' && !ended)) return false;
      if (filter === 'past' && !(b.status !== 'CANCELLED' && ended)) return false;
      if (filter === 'cancelled' && b.status !== 'CANCELLED') return false;
      return !query || `${b.studentName} ${b.studentEmail} ${b.topic}`.toLowerCase().includes(query);
    })
    .sort((a, b) => (filter === 'upcoming' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)));

  const today = localDateKey(new Date(t).toISOString(), user.timeZone);
  const active = all.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) > t);
  const todayCount = active.filter((b) => localDateKey(b.start, user.timeZone) === today).length;
  const weekCount = active.filter((b) => Date.parse(b.start) < t + 7 * 86_400_000).length;
  const toRecord = all.filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) <= t).length;
  const selected = all.find((b) => b.id === selectedId) ?? null;

  function exportCsv() {
    const rows = visible.map((b: TeacherBooking) => [
      fmtDate(b.start, user.timeZone),
      fmtTime(b.start, user.timeZone),
      fmtTime(b.end, user.timeZone),
      b.studentName,
      b.studentEmail,
      b.status,
      (b.lessonId && lessonMap.get(b.lessonId)?.title) || '',
      b.topic,
      b.studentNote,
      b.feedback,
    ]);
    const csv = toCsv([
      ['Date', 'Start', 'End', 'Student', 'Email', 'Status', 'Lesson', 'Topic', 'Student note', 'Feedback'],
      ...rows,
    ]);
    const url = URL.createObjectURL(new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), { href: url, download: `bookings-${filter}.csv` }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h2>Bookings</h2>
      <section className="cards">
        <div className="card">
          <span className="label">Today</span>
          <span className="value">{bookings.data ? todayCount : '–'}</span>
        </div>
        <div className="card">
          <span className="label">Next 7 days</span>
          <span className="value">{bookings.data ? weekCount : '–'}</span>
        </div>
        <div className="card">
          <span className="label">Upcoming</span>
          <span className="value">{bookings.data ? active.length : '–'}</span>
        </div>
        <div className="card">
          <span className="label">Awaiting outcome</span>
          <span className="value">{bookings.data ? toRecord : '–'}</span>
          <span className="hint">Past classes not yet marked completed / no-show</span>
        </div>
      </section>

      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Filter bookings">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={filter === f.id ? 'active' : ''}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ViewSwitcher view={view} onChange={setView} />
      </div>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search student or topic"
          aria-label="Search student or topic"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" disabled={visible.length === 0} onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <ErrorText error={bookings.error} />
      {!bookings.data ? (
        <p>Loading…</p>
      ) : (
        <BookingViews
          view={view}
          bookings={visible}
          timeZone={user.timeZone}
          lessons={lessonMap}
          now={t}
          showStudent
          onSelect={(b) => setSelectedId(b.id)}
        />
      )}

      {selected && (
        <BookingEditor
          key={selected.id}
          booking={selected}
          lessons={lessons.data ?? []}
          onClose={() => setSelectedId(null)}
          onChanged={bookings.reload}
        />
      )}
    </>
  );
}
