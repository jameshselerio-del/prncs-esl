import { useState, type FormEvent } from 'react';
import {
  normalizeUsername,
  passwordErrors,
  PASSWORD_MAX,
  USERNAME_MAX,
  usernameErrors,
} from '../../../shared/validation';
import { useApi } from '../api';
import { useAuth } from '../auth';
import { useSession } from '../session';
import { ErrorText } from './Bits';
import { NewPasswordFields } from './PasswordSignIn';

/** Profile section: add a username and password, or change them (needs the current password). */
export function PasswordSettings() {
  const api = useApi();
  const { passwordSession, replaceToken } = useAuth();
  const { user, username, refresh } = useSession();
  const hasPassword = username !== null;
  const [name, setName] = useState(username ?? '');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    const problems = [...usernameErrors(name), ...passwordErrors(password, { username: name, email: user.email })];
    if (password !== confirm) problems.push('The new passwords do not match.');
    if (problems.length) {
      setError(problems.join('\n'));
      return;
    }
    setBusy(true);
    try {
      const result = await api('setPassword', { username: name, currentPassword: current, newPassword: password });
      // Changing the password ends older password sessions, including this one, so keep the new one.
      if (passwordSession) replaceToken(result.token);
      setName(result.username);
      setCurrent('');
      setPassword('');
      setConfirm('');
      setSaved(hasPassword ? 'Password changed.' : `Done. You can now sign in as “${result.username}”.`);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="password-settings" aria-labelledby="password-title">
      <h3 id="password-title">{hasPassword ? 'Username and password' : 'Sign in with a password'}</h3>
      <p className="hint">
        {hasPassword
          ? 'You can sign in with Google or with this username and password.'
          : 'You sign in with Google. Add a username and password to also sign in without Google.'}
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          Username
          <input
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setName((v) => normalizeUsername(v))}
          />
          <span className="hint">Letters, numbers, dots, dashes and underscores.</span>
        </label>
        {hasPassword && (
          <label>
            Current password
            <input
              required
              type="password"
              autoComplete="current-password"
              maxLength={PASSWORD_MAX}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <span className="hint">Forgot it? Sign out and use “Forgot password?” on the sign-in page.</span>
          </label>
        )}
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <ErrorText error={error} />
        {saved && (
          <p className="success" role="status">
            {saved}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Turn on password sign-in'}
          </button>
        </div>
      </form>
    </section>
  );
}
