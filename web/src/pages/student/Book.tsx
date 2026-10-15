import { useNavigate } from 'react-router-dom';
import { useQuery } from '../../api';
import { useSession } from '../../session';
import { BookingPicker } from './BookingPicker';

export function Book() {
  const navigate = useNavigate();
  const { user, settings, now } = useSession();
  const mine = useQuery('myBookings');
  const upcoming = (mine.data ?? []).filter((b) => b.status === 'CONFIRMED' && Date.parse(b.end) > now).length;

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
      <BookingPicker upcoming={upcoming} onBooked={() => navigate('/bookings', { state: { booked: true } })} />
    </>
  );
}
