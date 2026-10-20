import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasEmail, levelLabel } from '../../../shared/validation';
import { useAuth } from '../auth';
import { useSession } from '../session';
import { useTheme, type ThemeChoice } from '../theme';
import { usePopover } from './usePopover';

/** The Google profile picture from the ID token's payload (mock tokens have none). */
function pictureFromToken(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const picture = (JSON.parse(json) as { picture?: unknown }).picture;
    return typeof picture === 'string' && picture.startsWith('https://') ? picture : null;
  } catch {
    return null;
  }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export function Avatar({ name, picture, size }: { name: string; picture: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  return picture && !failed ? (
    <img
      className="avatar"
      src={picture}
      alt=""
      width={size}
      height={size}
      // Google profile images refuse requests that carry a Referer.
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="avatar initials" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** Top-right account button: profile, theme, links and sign-out in a popover panel. */
export function AccountMenu() {
  const { user } = useSession();
  const { idToken, passwordSession, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const { open, setOpen, rootRef, buttonRef } = usePopover();
  const panelId = useId();
  const picture = pictureFromToken(idToken);
  const isTeacher = user.role === 'ADMIN';

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="account-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.name} picture={picture} size={36} />
        <span className="account-name" aria-hidden="true">
          {user.name.split(' ')[0]}
        </span>
        <svg className="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d={open ? 'M2.5 7.5 6 4l3.5 3.5' : 'M2.5 4.5 6 8l3.5-3.5'}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="account-panel" id={panelId} role="region" aria-label="Account">
          <div className="account-head">
            <Avatar name={user.name} picture={picture} size={52} />
            <div className="account-who">
              <strong>{user.name}</strong>
              <span className="hint">{hasEmail(user.email) ? user.email : 'No email address'}</span>
              <span>
                <span className="tag">{isTeacher ? 'Teacher' : 'Student'}</span>
                {!isTeacher && user.level && <span className="tag">{levelLabel(user.level)}</span>}
              </span>
            </div>
          </div>

          <dl className="account-facts">
            <dt>Time zone</dt>
            <dd>{user.timeZone}</dd>
            {user.contact && (
              <>
                <dt>Contact</dt>
                <dd>{user.contact}</dd>
              </>
            )}
          </dl>

          {/* Choosing a link closes the menu. */}
          <nav className="account-links" aria-label="Account" onClick={() => setOpen(false)}>
            <Link to="/profile">Profile settings</Link>
            {isTeacher ? (
              <Link to="/availability">Availability &amp; booking settings</Link>
            ) : (
              <>
                <Link to="/bookings">My bookings</Link>
                <Link to="/announcements">Announcements</Link>
              </>
            )}
            {/* Only for Google sign-ins; password users may have no Google account at all. */}
            {!passwordSession && (
              <a href="https://myaccount.google.com/" target="_blank" rel="noreferrer">
                Manage Google account
              </a>
            )}
          </nav>

          <fieldset className="account-theme">
            <legend>Theme</legend>
            <div className="segmented">
              {THEMES.map((t) => (
                <label key={t.id} className={theme === t.id ? 'active' : ''}>
                  <input
                    type="radio"
                    name="theme"
                    value={t.id}
                    checked={theme === t.id}
                    onChange={() => setTheme(t.id)}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>

          <button type="button" className="account-signout" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
