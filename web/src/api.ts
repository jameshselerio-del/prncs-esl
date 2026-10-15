import { useCallback, useEffect, useState } from 'react';
import type { Action, Api, ApiResponse } from '../../shared/api';
import { useAuth } from './auth';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export class SessionExpiredError extends Error {}

export async function callApi<A extends Action>(idToken: string, action: A, payload: Api[A][0]): Promise<Api[A][1]> {
  if (!API_URL) throw new Error('VITE_API_URL is not set.');
  const res = await fetch(API_URL, {
    method: 'POST',
    // text/plain keeps this a "simple" CORS request; Apps Script cannot answer preflights.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, idToken, payload }),
  });
  if (!res.ok) throw new Error(`Server error (${res.status}).`);
  const body = (await res.json()) as ApiResponse<Api[A][1]>;
  if (!body.ok) {
    if (body.code === 'AUTH') throw new SessionExpiredError(body.error);
    throw new Error(body.error);
  }
  return body.data;
}

/** Returns a caller bound to the signed-in user that signs out on expired sessions. */
export function useApi() {
  const { idToken, signOut } = useAuth();
  return useCallback(
    async <A extends Action>(action: A, payload: Api[A][0]): Promise<Api[A][1]> => {
      try {
        return await callApi(idToken ?? '', action, payload);
      } catch (err) {
        if (err instanceof SessionExpiredError) signOut(err.message);
        throw err;
      }
    },
    [idToken, signOut],
  );
}

/** Loads an action with no payload; `reload` re-fetches it. */
export function useQuery<A extends Action>(action: A) {
  const api = useApi();
  const [data, setData] = useState<Api[A][1] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    api(action, {} as Api[A][0])
      .then((d) => active && (setData(d), setError(null)))
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [api, action, version]);

  return { data, error, reload: () => setVersion((v) => v + 1) };
}
