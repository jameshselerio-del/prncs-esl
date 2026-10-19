import { useState } from 'react';
import { normalizeUsername, PASSWORD_MAX, USERNAME_MAX } from '../../../shared/validation';

const WORDS = [
  'apple',
  'bamboo',
  'cherry',
  'cloud',
  'coral',
  'forest',
  'garden',
  'harbor',
  'honey',
  'island',
  'lemon',
  'maple',
  'meadow',
  'melon',
  'moss',
  'ocean',
  'orange',
  'panda',
  'peach',
  'pebble',
  'pine',
  'plum',
  'rain',
  'river',
  'robin',
  'sakura',
  'snow',
  'spring',
  'star',
  'summer',
  'sun',
  'tiger',
  'tulip',
  'violet',
  'willow',
  'winter',
];

/** An easy-to-read, easy-to-type password such as `maple-river-42`, for the teacher to hand over. */
export function suggestPassword(): string {
  const n = new Uint32Array(3);
  crypto.getRandomValues(n);
  return `${WORDS[n[0] % WORDS.length]}-${WORDS[n[1] % WORDS.length]}-${10 + (n[2] % 90)}`;
}

/** Username + visible password with a "Suggest" button (the teacher passes them on, so they are shown). */
export function StudentLoginFields({
  username,
  password,
  onUsername,
  onPassword,
}: {
  username: string;
  password: string;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
}) {
  return (
    <>
      <label>
        Username
        <input
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={USERNAME_MAX}
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          onBlur={() => onUsername(normalizeUsername(username))}
        />
        <span className="hint">Letters, numbers, dots, dashes and underscores. Easy to remember is best.</span>
      </label>
      <label>
        Password
        <span className="password-suggest">
          <input
            required
            type="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(e) => onPassword(e.target.value)}
          />
          <button type="button" onClick={() => onPassword(suggestPassword())}>
            Suggest
          </button>
        </span>
        <span className="hint">At least 8 characters. They can change it later on their Profile page.</span>
      </label>
    </>
  );
}

/** What to hand the student after the teacher sets up their sign-in. */
export function LoginCard({ name, username, password }: { name: string; username: string; password: string }) {
  const site = `${window.location.origin}${window.location.pathname}`;
  const [copied, setCopied] = useState(false);
  const text = `Website: ${site}\nUsername: ${username}\nPassword: ${password}`;

  return (
    <section className="login-card" aria-label="Sign-in details">
      <p>
        <strong>Give these to {name}.</strong> The password is only shown now.
      </p>
      <dl className="details">
        <dt>Website</dt>
        <dd>{site}</dd>
        <dt>Username</dt>
        <dd className="login-value">{username}</dd>
        <dt>Password</dt>
        <dd className="login-value">{password}</dd>
      </dl>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard
            ?.writeText(text)
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }
      >
        {copied ? 'Copied' : 'Copy details'}
      </button>
    </section>
  );
}
