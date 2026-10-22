import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentBooking } from '../../../../shared/api';
import { useQuery } from '../../api';
import { useSession } from '../../session';
import { fmtRange } from '../../time';
import { BookingPicker } from './BookingPicker';
import { InfoTip, Tr } from '../../hints';

export function Book() {
  const { user, settings, now } = useSession();
  const mine = useQuery('myBookings');
  const lessons = useQuery('lessons');
  const [justBooked, setJustBooked] = useState<StudentBooking[]>([]);
  const upcoming = (mine.data ?? []).filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) > now).length;
  const lessonTitle = (id: string | null) => lessons.data?.find((l) => l.id === id)?.title;

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
        {settings.cancelNoticeHours} hours before a class.{' '}
        <InfoTip
          id="book.rules"
          params={{ minutes: settings.lessonMinutes, zone: user.timeZone, hours: settings.cancelNoticeHours }}
        />
      </p>

      {justBooked.length > 0 && (
        <section className="booked-banner" role="status">
          <strong>
            {justBooked.length === 1 ? 'Your class is booked.' : `Your ${justBooked.length} classes are booked.`}
          </strong>{' '}
          A confirmation email is on its way.
          <Tr id="book.done" />
          <ul>
            {justBooked.map((b) => (
              <li key={b.id}>
                {fmtRange(b.start, b.end, user.timeZone)}
                {lessonTitle(b.lessonId) && ` · ${lessonTitle(b.lessonId)}`}
              </li>
            ))}
          </ul>
          <Link to="/bookings">
            View My bookings
            <Tr id="bookings.view" />
          </Link>
        </section>
      )}

      <BookingPicker
        upcoming={upcoming}
        onBooked={(booked) => {
          setJustBooked(booked);
          mine.reload();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </>
  );
}
