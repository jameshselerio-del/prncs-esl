import { useQuery } from '../../api';
import { Loading } from '../../brand';
import { ErrorText } from '../../components/Bits';
import { useSession } from '../../session';
import { fmtDate, fmtTime } from '../../time';

/** Student: messages from the teacher, newest first. */
export function MyAnnouncements() {
  const { user } = useSession();
  const announcements = useQuery('myAnnouncements');

  return (
    <>
      <h2>
        Announcements{' '}
        <span className="hint ja" lang="ja">
          お知らせ
        </span>
      </h2>
      <ErrorText error={announcements.error} />
      {!announcements.data ? (
        <Loading />
      ) : announcements.data.length === 0 ? (
        <p className="empty">No announcements yet. Messages from your teacher will appear here.</p>
      ) : (
        <ul className="announcement-list">
          {announcements.data.map((a) => (
            <li key={a.id} className="card">
              <h3>{a.title}</h3>
              <span className="hint">
                {fmtDate(a.sentAt, user.timeZone)}, {fmtTime(a.sentAt, user.timeZone)}
              </span>
              <p className="announcement-body">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
