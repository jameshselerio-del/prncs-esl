import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentBooking } from '../../../../shared/api';
import { useQuery } from '../../api';
import { ErrorText } from '../../components/Bits';
import { BookingViews, useBookingView, ViewSwitcher } from '../../components/BookingViews';
import { useSession } from '../../session';
import { Bilingual, Loading } from '../../brand';
import { BookingDetail } from './BookingDetail';
import { Tr, type HintId } from '../../hints';

type Filter = 'upcoming' | 'past' | 'cancelled' | 'all';
const FILTERS: { id: Filter; label: string; hint: HintId }[] = [
  { id: 'upcoming', label: 'Upcoming', hint: 'filter.upcoming' },
  { id: 'past', label: 'Past', hint: 'filter.past' },
  { id: 'cancelled', label: 'Cancelled', hint: 'filter.cancelled' },
  { id: 'all', label: 'All', hint: 'filter.all' },
];

export function MyBookings() {
  const { user, now } = useSession();
  const bookings = useQuery('myBookings');
  const lessons = useQuery('lessons');
  const [view, setView] = useBookingView();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [selected, setSelected] = useState<StudentBooking | null>(null);
  const lessonMap = useMemo(() => new Map((lessons.data ?? []).map((l) => [l.id, l])), [lessons.data]);

  const t = now;
  const visible = (bookings.data ?? [])
    .filter((b) => {
      const ended = Date.parse(b.end) <= t;
      if (filter === 'upcoming') return b.status === 'CONFIRMED' && !ended;
      if (filter === 'past') return b.status !== 'CANCELLED' && ended;
      if (filter === 'cancelled') return b.status === 'CANCELLED';
      return true;
    })
    .sort((a, b) => (filter === 'upcoming' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)));

  return (
    <>
      <div className="toolbar">
        <h2>
          My bookings
          <Tr id="nav.bookings" />
        </h2>
        <Link to="/book" className="button primary">
          <Bilingual en="Book a class" ja="予約する" />
        </Link>
      </div>
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
              <Tr id={f.hint} />
            </button>
          ))}
        </div>
        <ViewSwitcher view={view} onChange={setView} />
      </div>
      <ErrorText error={bookings.error} />
      {!bookings.data ? (
        <Loading />
      ) : (
        <BookingViews
          view={view}
          bookings={visible}
          timeZone={user.timeZone}
          lessons={lessonMap}
          now={t}
          onSelect={setSelected}
        />
      )}
      {selected && (
        <BookingDetail
          booking={selected}
          lessons={lessonMap}
          onClose={() => setSelected(null)}
          onChanged={bookings.reload}
        />
      )}
    </>
  );
}
