import { createContext, useContext } from 'react';
import type { Settings, User } from '../../shared/types';

export interface Session {
  user: User;
  settings: Settings;
  /** Current time in ms, refreshed every 30 seconds so "upcoming" and countdowns stay current. */
  now: number;
  /** Re-fetch the signed-in user and settings (after a profile or settings change). */
  refresh: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionContext');
  return session;
}
