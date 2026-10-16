import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationText, todoText, type AppNotification, type Inbox, type Todo } from '../../../shared/notifications';
import { isHttpUrl } from '../../../shared/validation';
import { useApi } from '../api';
import { LeafMark } from '../brand';
import { useSession } from '../session';
import { fmtDate, fmtTime, relative } from '../time';
import { usePopover } from './usePopover';

/** The server can't push to the page, so the bell checks on load, on returning to the tab, and every few minutes. */
const REFRESH_MS = 3 * 60_000;

function useInbox() {
  const api = useApi();
  const [inbox, setInbox] = useState<Inbox | null>(null);

  const load = useCallback(() => {
    api('notifications', {})
      .then(setInbox)
      // A failed background check keeps the last list; the next check retries.
      .catch(() => undefined);
  }, [api]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { inbox, setInbox, load };
}

/** Bell beside the account menu: to-do items and recent updates, with an unread count. */
export function NotificationBell() {
  const api = useApi();
  const navigate = useNavigate();
  const { user, now } = useSession();
  const { inbox, setInbox, load } = useInbox();
  const { open, setOpen, rootRef, buttonRef } = usePopover();
  const panelId = useId();
  const isTeacher = user.role === 'ADMIN';
  const when = (iso: string) => `${fmtDate(iso, user.timeZone)}, ${fmtTime(iso, user.timeZone)}`;

  const unread = inbox?.notifications.filter((n) => !n.read) ?? [];
  const count = unread.length + (inbox?.todos.length ?? 0);

  function markRead(payload: { ids?: string[]; all?: boolean }) {
    // Optimistic: the list updates at once; the server catches up.
    setInbox(
      (current) =>
        current && {
          ...current,
          notifications: current.notifications.map((n) =>
            payload.all || payload.ids?.includes(n.id) ? { ...n, read: true } : n,
          ),
        },
    );
    api('markNotificationsRead', payload).catch(load);
  }

  function dismiss(todo: Todo) {
    setInbox((current) => current && { ...current, todos: current.todos.filter((t) => t.id !== todo.id) });
    api('dismissTodo', { id: todo.id }).catch(load);
  }

  function openNotification(n: AppNotification) {
    if (!n.read) markRead({ ids: [n.id] });
    setOpen(false);
    navigate(isTeacher ? '/' : '/bookings');
  }

  return (
    <div className="bell" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="bell-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={count ? `Notifications, ${count} new` : 'Notifications'}
        onClick={() => {
          if (!open) load();
          setOpen((o) => !o);
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 9.5a6 6 0 0 1 12 0c0 4.2 1.4 6 2.3 6.8.3.3.1.7-.3.7H4c-.4 0-.6-.4-.3-.7.9-.8 2.3-2.6 2.3-6.8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M9.8 20a2.3 2.3 0 0 0 4.4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {count > 0 && (
          <span className="bell-badge" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="bell-panel" id={panelId} role="region" aria-label="Notifications">
          <div className="bell-head">
            <h2>Notifications</h2>
            {unread.length > 0 && (
              <button type="button" className="link" onClick={() => markRead({ all: true })}>
                Mark all as read
              </button>
            )}
          </div>

          {!inbox ? (
            <p className="hint">Loading…</p>
          ) : inbox.todos.length === 0 && inbox.notifications.length === 0 ? (
            <div className="bell-empty">
              <LeafMark size={40} />
              <p>You're all caught up.</p>
            </div>
          ) : (
            <>
              {inbox.todos.length > 0 && (
                <section aria-label="To do">
                  <h3 className="bell-section">To do</h3>
                  <ul className="bell-list">
                    {inbox.todos.map((t) => (
                      <TodoItem
                        key={t.id}
                        todo={t}
                        when={t.classStart ? fmtTime(t.classStart, user.timeZone) : ''}
                        home={isTeacher ? '/' : '/bookings'}
                        onGo={() => setOpen(false)}
                        onDismiss={() => dismiss(t)}
                      />
                    ))}
                  </ul>
                </section>
              )}
              {inbox.notifications.length > 0 && (
                <section aria-label="Updates">
                  <h3 className="bell-section">Updates</h3>
                  <ul className="bell-list">
                    {inbox.notifications.map((n) => {
                      const text = notificationText(n, when(n.classStart));
                      return (
                        <li key={n.id} className={n.read ? 'bell-item' : 'bell-item unread'}>
                          <button type="button" className="bell-open" onClick={() => openNotification(n)}>
                            {!n.read && <span className="visually-hidden">Unread: </span>}
                            <span className="bell-title">{text.title}</span>
                            {text.detail && <span className="bell-detail">{text.detail}</span>}
                            <span className="bell-time">{relative(n.createdAt, now)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TodoItem({
  todo,
  when,
  home,
  onGo,
  onDismiss,
}: {
  todo: Todo;
  when: string;
  /** Where the user's bookings are: Bookings (teacher) or My bookings (student). */
  home: string;
  onGo: () => void;
  onDismiss: () => void;
}) {
  const text = todoText(todo, when);
  const action =
    todo.kind === 'CLASS_SOON' && todo.meetingLink && isHttpUrl(todo.meetingLink) ? (
      <a className="button small primary" href={todo.meetingLink} target="_blank" rel="noreferrer" onClick={onGo}>
        Join class
      </a>
    ) : (
      <Link
        className="button small secondary"
        to={todo.kind === 'RECORD_OUTCOMES' || todo.kind === 'CLASS_SOON' ? home : '/profile'}
        onClick={onGo}
      >
        {todo.kind === 'RECORD_OUTCOMES'
          ? 'Open bookings'
          : todo.kind === 'CLASS_SOON'
            ? 'View class'
            : 'Go to profile'}
      </Link>
    );

  return (
    <li className="bell-item todo">
      <span className="bell-title">{text.title}</span>
      <span className="bell-detail">{text.detail}</span>
      <span className="bell-actions">
        {action}
        {todo.dismissible && (
          <button type="button" className="link" onClick={onDismiss} aria-label={`Dismiss: ${text.title}`}>
            Not now
          </button>
        )}
      </span>
    </li>
  );
}
