import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { SignInLayout } from './brand';
import { PasswordSignIn } from './components/PasswordSignIn';
import { MockIdentityBar, MockSignIn } from './MockIdentity';

const TOKEN_KEY = 'idToken';
/** Password sessions from the backend start with this; anything else is a Google ID token. */
const PASSWORD_SESSION_PREFIX = 'pw.';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'Komorebi English';
/** `npm run dev:mock`: talk to the local mock API with test identities instead of Google. */
const MOCK = import.meta.env.MODE === 'mock';

interface AuthContextValue {
  /** A Google ID token, or a password session token (`pw.…`). */
  idToken: string | null;
  /** True when signed in with a username and password rather than Google. */
  passwordSession: boolean;
  /** Swaps in a new token for the same user (after a password change) without reloading the app. */
  replaceToken: (token: string) => void;
  /** `notice` is shown on the sign-in screen, e.g. why the session ended. */
  signOut: (notice?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function storeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage may be unavailable (private mode); the in-memory state is used regardless.
  }
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [idToken, setIdToken] = useState<string | null>(readToken);
  // Bumped on every sign-in (not on replaceToken), so a new identity starts from a clean slate.
  const [signIns, setSignIns] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const signOut = useCallback((reason?: string) => {
    storeToken(null);
    window.google?.accounts.id.disableAutoSelect();
    setNotice(reason ?? null);
    setIdToken(null);
  }, []);

  const signIn = useCallback((token: string) => {
    storeToken(token);
    setSignIns((n) => n + 1);
    setIdToken(token);
  }, []);

  const replaceToken = useCallback((token: string) => {
    storeToken(token);
    setIdToken(token);
  }, []);

  const passwordSession = idToken?.startsWith(PASSWORD_SESSION_PREFIX) ?? false;

  return (
    <AuthContext.Provider value={{ idToken, passwordSession, replaceToken, signOut }}>
      {idToken ? (
        <>
          <Fragment key={signIns}>{children}</Fragment>
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
        text: 'continue_with',
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
    <SignInLayout>
      <p>Sign in to book and manage your lessons.</p>
      {notice && <p className="notice">{notice}</p>}
      <PasswordSignIn onSignIn={onSignIn} />
      {/* Google is an optional extra; username and password is the main way in. */}
      <OrDivider />
      <div ref={buttonRef} aria-label="Continue with Google" />
      {error && <p className="error">{error}</p>}
    </SignInLayout>
  );
}

export function OrDivider() {
  return (
    <p className="or-divider" aria-hidden="true">
      <span>or</span>
    </p>
  );
}
