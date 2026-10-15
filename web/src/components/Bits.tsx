import type { BookingStatus, Lesson } from '../../../shared/types';
import { isHttpUrl, levelLabel } from '../../../shared/validation';

const STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`badge ${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>;
}

/** Plain text with blank-line paragraphs; bare http(s) URLs become links. */
export function RichText({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rich">
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i}>
          {para.split(/(https?:\/\/\S+)/g).map((part, j) =>
            isHttpUrl(part) ? (
              <a key={j} href={part} target="_blank" rel="noreferrer">
                {part}
              </a>
            ) : (
              <span key={j}>{part}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  // Only http(s) links are rendered, so stored values can't inject javascript: URLs.
  if (!isHttpUrl(href)) return <span>{href}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function LessonCard({ lesson, open = false }: { lesson: Lesson; open?: boolean }) {
  return (
    <details className="lesson" open={open}>
      <summary>
        <strong>{lesson.title}</strong>
        {lesson.level && <span className="tag">{levelLabel(lesson.level)}</span>}
        {lesson.summary && <span className="hint"> — {lesson.summary}</span>}
      </summary>
      <RichText text={lesson.content} />
      {lesson.materialsUrl && (
        <p>
          <ExternalLink href={lesson.materialsUrl}>Open materials</ExternalLink>
        </p>
      )}
    </details>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
