import { useState, type FormEvent } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '../../../shared/validation';
import { callApi } from '../api';
import { ErrorText } from './Bits';

type Mode = 'signin' | 'forgot' | 'reset';

/**
 * Username/password sign-in on the signed-out screen, with "forgot password" by emailed code.
 * Accounts get a password from their Profile page after first signing in with Google.
 */
export function PasswordSignIn({ onSignIn }: { onSignIn: (token: string) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirm('');
    setCode('');
  }

  async function run(e: FormEvent, action: () => Promise<void>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const loginField = (
    <label>
      Username or email
      <input
        required
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={254}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
      />
    </label>
  );

  if (mode === 'forgot') {
    return (
      <form
        className="form password-signin"
        aria-label="Reset password"
        onSubmit={(e) =>
          run(e, async () => {
            await callApi('', 'requestPasswordReset', { login });
            go('reset');
          })
        }
      >
        <h2>Forgot your password?</h2>
        <p className="hint">Enter your username or email and we'll email you a code to set a new password.</p>
        {loginField}
        <ErrorText error={error} />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
        <button type="button" className="link" onClick={() => go('signin')}>
          Back to sign in
        </button>
      </form>
    );
  }

  if (mode === 'reset') {
    return (
      <form
        className="form password-signin"
        aria-label="Set a new password"
        onSubmit={(e) =>
          run(e, async () => {
            if (password !== confirm) throw new Error('The new passwords do not match.');
            const { token } = await callApi('', 'resetPassword', { login, code, newPassword: password });
            onSignIn(token);
          })
        }
      >
        <h2>Check your email</h2>
        <p className="hint">
          If <strong>{login}</strong> has a password, we sent a 6-digit code to its email address. It expires in 15
          minutes.
        </p>
        <label>
          Code
          <input
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </label>
        <NewPasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <ErrorText error={error} />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Set new password and sign in'}
        </button>
        <button type="button" className="link" onClick={() => go('forgot')}>
          Send a new code
        </button>
      </form>
    );
  }

  return (
    <form
      className="form password-signin"
      aria-label="Sign in with username"
      onSubmit={(e) =>
        run(e, async () => {
          const { token } = await callApi('', 'signInWithPassword', { login, password });
          onSignIn(token);
        })
      }
    >
      {loginField}
      <label>
        Password
        <input
          required
          type="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <ErrorText error={error} />
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <button type="button" className="link" onClick={() => go('forgot')}>
        Forgot password?
      </button>
    </form>
  );
}

/** "New password" + "Confirm new password", shared by the reset form and the Profile page. */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  return (
    <>
      <label>
        New password
        <input
          required
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
        />
        <span className="hint">At least {PASSWORD_MIN} characters. A short phrase is easy to remember.</span>
      </label>
      <label>
        Confirm new password
        <input
          required
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
        />
      </label>
    </>
  );
}
