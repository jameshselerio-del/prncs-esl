// Dev-only sign-in for `npm run dev:mock` (Vite mode `mock`). The mock API accepts
// tokens of the form `email|Display Name` instead of Google ID tokens.
import { useEffect, useState, type FormEvent } from 'react';
import { APP_NAME, OrDivider } from './auth';
import { SignInLayout } from './brand';
import { PasswordSignIn } from './components/PasswordSignIn';

interface Identity {
  label: string;
  token: string;
}

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

function useIdentities(): Identity[] {
  const [identities, setIdentities] = useState<Identity[]>([]);
  useEffect(() => {
    if (!API_URL) return;
    fetch(new URL('/__mock/identities', API_URL))
      .then((r) => r.json() as Promise<Identity[]>)
      .then(setIdentities)
      .catch(() => setIdentities([]));
  }, []);
  return identities;
}

export function MockSignIn({ onSignIn, notice }: { onSignIn: (token: string) => void; notice: string | null }) {
  const identities = useIdentities();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) onSignIn(`${email.trim()}|${name.trim()}`);
  }

  return (
    <SignInLayout>
      <p>
        <span className="tag">Mock API</span> {APP_NAME}: sign in as a test identity.
      </p>
      {notice && <p className="notice">{notice}</p>}
      <div className="mock-identities">
        {identities.map((id) => (
          <button key={id.token} type="button" onClick={() => onSignIn(id.token)}>
            {id.label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mock-identities">
        <input placeholder="any@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit">Sign in as this email</button>
      </form>
      <OrDivider />
      <PasswordSignIn onSignIn={onSignIn} />
    </SignInLayout>
  );
}

/** Floating switcher shown while signed in to the mock API. */
export function MockIdentityBar({ token, onSwitch }: { token: string; onSwitch: (token: string) => void }) {
  const identities = useIdentities();
  const known = identities.some((id) => id.token === token);
  const label = token.startsWith('pw.') ? 'password session' : token.split('|')[0];
  return (
    <label className="mock-bar">
      Mock API as{' '}
      <select value={token} onChange={(e) => onSwitch(e.target.value)}>
        {!known && <option value={token}>{label}</option>}
        {identities.map((id) => (
          <option key={id.token} value={id.token}>
            {id.label}
          </option>
        ))}
      </select>
    </label>
  );
}
