import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { LegalLinks } from './components/LegalLinks';
import { MockIdentityBar, MockSignIn } from './MockIdentity';

const TOKEN_KEY = 'idToken';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'ESL Classes';
/** `npm run dev:mock`: talk to the local mock API with test identities instead of Google. */
const MOCK = import.meta.env.MODE === 'mock';

interface AuthContextValue {
  idToken: string | null;
  /** `notice` is shown on the sign-in screen, e.g. why the session ended. */
  signOut: (notice?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [idToken, setIdToken] = useState<string | null>(readToken);
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback((reason?: string) => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage may be unavailable (private mode); the in-memory state is cleared regardless.
    }
    window.google?.accounts.id.disableAutoSelect();
    setNotice(reason ?? null);
    setIdToken(null);
  }, []);

  const signIn = useCallback((token: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // See signOut.
    }
    setIdToken(token);
  }, []);

  return (
    <AuthContext.Provider value={{ idToken, signOut }}>
      {idToken ? (
        <>
          {/* Keyed so switching identity starts from a clean slate. */}
          <Fragment key={idToken}>{children}</Fragment>
          {MOCK && <MockIdentityBar token={idToken} onSwitch={signIn} />}
        </>
      ) : MOCK ? (
        <MockSignIn onSignIn={signIn} notice={notice} />
      ) : (
        <SignIn onSignIn={signIn} notice={notice} />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

function SignIn({ onSignIn, notice }: { onSignIn: (token: string) => void; notice: string | null }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(CLIENT_ID ? null : 'VITE_GOOGLE_CLIENT_ID is not set.');

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    // The GIS script loads asynchronously; poll briefly until it is ready.
    const timer = window.setInterval(() => {
      if (cancelled || !window.google || !buttonRef.current) return;
      window.clearInterval(timer);
      window.google.accounts.id.initialize({ client_id: CLIENT_ID, callback: (r) => onSignIn(r.credential) });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
      });
    }, 100);
    const giveUp = window.setTimeout(() => {
      if (!window.google) setError('Could not load Google Sign-In. Check your connection or ad blocker.');
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
    };
  }, [onSignIn]);

  return (
    <main className="signin">
      <h1>{APP_NAME}</h1>
      <p>Book one-to-one English classes. Sign in with your Google account to continue.</p>
      {notice && <p className="notice">{notice}</p>}
      <div ref={buttonRef} />
      {error && <p className="error">{error}</p>}
      <p className="hint">
        <LegalLinks />
      </p>
    </main>
  );
}
