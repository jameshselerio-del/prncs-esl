import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentBooking } from '../../../../shared/api';
import { useQuery } from '../../api';
import { ErrorText, ExternalLink, LessonCard, RichText, StatusBadge } from '../../components/Bits';
import { useSession } from '../../session';
import { fmtDate, fmtRange, fmtTime, relative } from '../../time';
import { Bilingual, LeafShape } from '../../brand';
import { BookingDetail } from './BookingDetail';

/** Upcoming classes listed in the Home summary; the rest are a click away in My bookings. */
const SUMMARY_LIMIT = 4;

export function Home() {
  const { user, settings, now } = useSession();
  const bookings = useQuery('myBookings');
  const lessons = useQuery('lessons');
  const [selected, setSelected] = useState<StudentBooking | null>(null);
  const lessonMap = useMemo(() => new Map((lessons.data ?? []).map((l) => [l.id, l])), [lessons.data]);

  const t = now;
  const all = bookings.data ?? [];
  const upcoming = all
    .filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) > t)
    .sort((a, b) => a.start.localeCompare(b.start));
  const recent = all
    .filter((b) => (b.status === 'COMPLETED' || b.status === 'CONFIRMED') && Date.parse(b.end) <= t)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 3);
  const next = upcoming[0];
  const nextLesson = next?.lessonId ? lessonMap.get(next.lessonId) : undefined;
  const titleOf = (b: StudentBooking) => (b.lessonId && lessonMap.get(b.lessonId)?.title) || b.topic || 'English class';
  const thisWeek = upcoming.filter((b) => Date.parse(b.start) < t + 7 * 86_400_000).length;
  const atLimit = upcoming.length >= settings.maxUpcomingPerStudent;

  return (
    <>
      <h2>Hi, {user.name.split(' ')[0]}</h2>
      <ErrorText error={bookings.error ?? lessons.error} />

      <div className="home-top">
        <section className="hero card">
          <LeafShape className="hero-leaf" />
          <span className="label">Next class</span>
          {!bookings.data ? (
            <p>Loading…</p>
          ) : next ? (
            <>
              <h3>{nextLesson?.title || next.topic || 'English class'}</h3>
              <p>
                {fmtRange(next.start, next.end, user.timeZone)}{' '}
                <span className="hint">({relative(next.start, t)})</span>
              </p>
              <div className="actions">
                {next.meetingLink && (
                  <ExternalLink href={next.meetingLink}>
                    <span className="button primary">
                      <Bilingual en="Join class" ja="参加する" />
                    </span>
                  </ExternalLink>
                )}
                <button type="button" onClick={() => setSelected(next)}>
                  Class details
                </button>
              </div>
              {nextLesson?.summary && <p className="hint">{nextLesson.summary}</p>}
            </>
          ) : (
            <p>You have no upcoming classes yet.</p>
          )}
        </section>

        <section className="book-cta" aria-labelledby="book-cta-title">
          <LeafShape className="book-cta-leaf" color="currentColor" />
          <span className="label">{upcoming.length ? 'Another lesson?' : 'Get started'}</span>
          <h3 id="book-cta-title">{upcoming.length ? 'Book your next class' : 'Book your first class'}</h3>
          <p className="ja" lang="ja">
            レッスンを予約しましょう
          </p>
          {atLimit ? (
            <p className="book-cta-note">
              You have {upcoming.length} upcoming classes, the most you can hold at once. You can book again after one
              of them.
            </p>
          ) : (
            <p className="book-cta-note">
              {settings.lessonMinutes}-minute classes · times in {user.timeZone}
            </p>
          )}
          <Link to="/book" className="button book-cta-button">
            <Bilingual en="Book a class" ja="予約する" />
            <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>

      {bookings.data && (
        <section className="card upcoming-summary" aria-labelledby="upcoming-title">
          <div className="summary-head">
            <h3 id="upcoming-title">Upcoming classes</h3>
            <div className="summary-stats">
              <span className="stat">
                <strong>{upcoming.length}</strong> booked
              </span>
              <span className="stat">
                <strong>{thisWeek}</strong> in the next 7 days
              </span>
            </div>
          </div>
          {upcoming.length === 0 ? (
            <p className="hint">No classes booked yet. Your booked classes will be listed here.</p>
          ) : (
            <ul className="summary-list">
              {upcoming.slice(0, SUMMARY_LIMIT).map((b) => (
                <li key={b.id}>
                  <button type="button" className="summary-item" onClick={() => setSelected(b)}>
                    <span className="summary-date">{fmtDate(b.start, user.timeZone)}</span>
                    <span className="summary-time">
                      {fmtTime(b.start, user.timeZone)} – {fmtTime(b.end, user.timeZone)}
                    </span>
                    <span className="summary-title">{titleOf(b)}</span>
                    <span className="hint">{relative(b.start, t)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="summary-foot">
            {upcoming.length > SUMMARY_LIMIT && <span className="hint">+{upcoming.length - SUMMARY_LIMIT} more</span>}
            <Link to="/bookings" className="button secondary">
              View My bookings
            </Link>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h3>Recent classes</h3>
          <ul className="list">
            {recent.map((b) => (
              <li key={b.id}>
                <button type="button" className="row-button" onClick={() => setSelected(b)}>
                  <span>
                    {fmtRange(b.start, b.end, user.timeZone)} <StatusBadge status={b.status} />
                  </span>
                  <span className="hint">{titleOf(b)}</span>
                </button>
                {b.feedback && (
                  <div className="feedback">
                    <span className="label">Teacher feedback</span>
                    <RichText text={b.feedback} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Lessons</h3>
        {!lessons.data ? (
          <p>Loading…</p>
        ) : lessons.data.length === 0 ? (
          <p className="hint">Your teacher hasn't published any lessons yet.</p>
        ) : (
          lessons.data.map((l) => <LessonCard key={l.id} lesson={l} />)
        )}
      </section>

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
