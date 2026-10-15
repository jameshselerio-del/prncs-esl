import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentBooking } from '../../../../shared/api';
import { useQuery } from '../../api';
import { ErrorText, ExternalLink, LessonCard, RichText, StatusBadge } from '../../components/Bits';
import { useSession } from '../../session';
import { fmtRange, relative } from '../../time';
import { Bilingual, LeafShape } from '../../brand';
import { BookingDetail } from './BookingDetail';

export function Home() {
  const { user, now } = useSession();
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

  return (
    <>
      <h2>Hi, {user.name.split(' ')[0]}</h2>
      <ErrorText error={bookings.error ?? lessons.error} />

      <section className="hero card">
        <LeafShape className="hero-leaf" />
        <span className="label">Next class</span>
        {!bookings.data ? (
          <p>Loading…</p>
        ) : next ? (
          <>
            <h3>{nextLesson?.title || next.topic || 'English class'}</h3>
            <p>
              {fmtRange(next.start, next.end, user.timeZone)} <span className="hint">({relative(next.start, t)})</span>
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
          <>
            <p>You have no upcoming classes.</p>
            <Link to="/book" className="button primary">
              <Bilingual en="Book a class" ja="予約する" />
            </Link>
          </>
        )}
      </section>

      {upcoming.length > 1 && (
        <section>
          <h3>Coming up</h3>
          <ul className="list">
            {upcoming.slice(1, 4).map((b) => (
              <li key={b.id}>
                <button type="button" className="row-button" onClick={() => setSelected(b)}>
                  <span>{fmtRange(b.start, b.end, user.timeZone)}</span>
                  <span className="hint">{(b.lessonId && lessonMap.get(b.lessonId)?.title) || b.topic}</span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/bookings">All my bookings →</Link>
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
                  <span className="hint">{(b.lessonId && lessonMap.get(b.lessonId)?.title) || b.topic}</span>
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
