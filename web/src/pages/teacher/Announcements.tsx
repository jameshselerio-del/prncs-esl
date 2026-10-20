import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_TITLE_MAX,
  announcementErrors,
  personalize,
  PLACEHOLDERS,
} from '../../../../shared/announcements';
import { hasEmail, levelLabel } from '../../../../shared/validation';
import { useApi, useQuery } from '../../api';
import { Loading } from '../../brand';
import { ErrorText } from '../../components/Bits';
import { useSession } from '../../session';
import { fmtDate, fmtTime } from '../../time';

type Audience = 'all' | 'chosen';

/** Teacher: write a personalized announcement, choose who gets it, and see past ones. */
export function Announcements() {
  const api = useApi();
  const { user } = useSession();
  const students = useQuery('students');
  const history = useQuery('announcements');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const active = useMemo(() => (students.data ?? []).filter((s) => s.active), [students.data]);
  const recipients = audience === 'all' ? active : active.filter((s) => chosen.has(s.email));
  const withEmail = recipients.filter((s) => hasEmail(s.email)).length;
  const query = search.trim().toLowerCase();
  const shown = active.filter((s) => !query || `${s.name} ${s.username ?? ''}`.toLowerCase().includes(query));
  const previewFor = recipients[0] ?? { name: PLACEHOLDERS[1].example };
  const quota = history.data?.emailQuota;

  function insert(token: string) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function toggle(email: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSentMessage(null);
    const emails = recipients.map((s) => s.email);
    const problems = announcementErrors({ title, body, recipients: emails });
    if (problems.length) {
      setError(problems.join('\n'));
      return;
    }
    const how = sendEmail && withEmail > 0 ? 'by email and in the app' : 'in the app';
    if (!window.confirm(`Send "${title.trim()}" to ${emails.length} student(s) ${how}?`)) return;
    setBusy(true);
    try {
      const sent = await api('sendAnnouncement', { title, body, recipients: emails, sendEmail });
      setSentMessage(`Sent to ${sent.recipients.length} student(s).`);
      setTitle('');
      setBody('');
      setChosen(new Set());
      history.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h2>Announcements</h2>
      <p className="hint">
        Send a message to your students. It appears in their notification bell and on their Announcements page, and can
        also be emailed.
      </p>
      <ErrorText error={students.error ?? history.error} />

      <form className="card form wide announcement-form" onSubmit={send} aria-label="New announcement">
        <h3>New announcement</h3>
        <label>
          Title
          <input
            required
            maxLength={ANNOUNCEMENT_TITLE_MAX}
            placeholder="e.g. No classes next Friday"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Message
          <textarea
            ref={bodyRef}
            required
            className="tall"
            maxLength={ANNOUNCEMENT_BODY_MAX}
            placeholder="Hi {first name}, …"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <div className="placeholder-row">
          <span className="hint">Personalize:</span>
          {PLACEHOLDERS.map((p) => (
            <button key={p.token} type="button" className="button small" onClick={() => insert(p.token)}>
              + {p.label}
            </button>
          ))}
          <span className="hint">Each student sees their own name.</span>
        </div>

        <fieldset className="audience">
          <legend>Send to</legend>
          <label className="check">
            <input type="radio" name="audience" checked={audience === 'all'} onChange={() => setAudience('all')} />
            All active students ({active.length})
          </label>
          <label className="check">
            <input
              type="radio"
              name="audience"
              checked={audience === 'chosen'}
              onChange={() => setAudience('chosen')}
            />
            Choose students
          </label>
          {audience === 'chosen' &&
            (!students.data ? (
              <Loading />
            ) : (
              <div className="student-picker">
                <div className="row-between">
                  <input
                    type="search"
                    placeholder="Search students"
                    aria-label="Search students"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span className="actions">
                    <button
                      type="button"
                      className="link"
                      onClick={() => setChosen(new Set([...chosen, ...shown.map((s) => s.email)]))}
                    >
                      Select all shown
                    </button>
                    <button type="button" className="link" onClick={() => setChosen(new Set())}>
                      Clear
                    </button>
                  </span>
                </div>
                <ul aria-label="Students">
                  {shown.map((s) => (
                    <li key={s.email}>
                      <label className="check">
                        <input type="checkbox" checked={chosen.has(s.email)} onChange={() => toggle(s.email)} />
                        {s.name}
                        <span className="hint">
                          {[levelLabel(s.level), hasEmail(s.email) ? '' : 'no email'].filter(Boolean).join(' · ')}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="hint">{chosen.size} chosen</p>
              </div>
            ))}
        </fieldset>

        <label className="check">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Also send by email
        </label>
        {sendEmail && (
          <p className="hint">
            {withEmail} of {recipients.length} chosen student(s) have an email address.
            {quota !== undefined && ` Google allows ${quota} more emails today.`}
          </p>
        )}

        {(title || body) && (
          <section className="announcement-preview" aria-label="Preview">
            <span className="label">Preview for {previewFor.name}</span>
            <strong>{personalize(title, previewFor)}</strong>
            <p>{personalize(body, previewFor)}</p>
          </section>
        )}

        <ErrorText error={error} />
        {sentMessage && (
          <p className="success" role="status">
            {sentMessage}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || recipients.length === 0}>
            {busy ? 'Sending…' : `Send to ${recipients.length} student${recipients.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </form>

      <h3>Sent</h3>
      {!history.data ? (
        <Loading />
      ) : history.data.sent.length === 0 ? (
        <p className="empty">No announcements yet.</p>
      ) : (
        <ul className="announcement-list">
          {history.data.sent.map((a) => (
            <li key={a.id} className="card">
              <details>
                <summary>
                  <strong>{a.title}</strong>
                  <span className="hint">
                    {fmtDate(a.sentAt, user.timeZone)}, {fmtTime(a.sentAt, user.timeZone)} · {a.recipients.length}{' '}
                    student{a.recipients.length === 1 ? '' : 's'} · {a.emailed ? 'email and app' : 'app only'}
                  </span>
                </summary>
                <p className="announcement-body">{a.body}</p>
                <p className="hint">To: {a.recipients.map((r) => r.name).join(', ')}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
