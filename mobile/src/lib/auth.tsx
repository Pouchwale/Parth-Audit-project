import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CurrentUser } from '@shared/api';
import { api, ApiError, loadServer } from './api';
import { deviceInfo, deviceLocale } from './device';
import { pushLanguage } from './notification-logic';
import { newSignIn, unregister } from './push';
import { replyLanguage } from './settings';
import { deleteItem, getItem, setItem } from './storage';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  user: CurrentUser | null;
  /** Why the person was signed out, e.g. their session expired. */
  notice: string | null;
  /** When this session ends (ISO), as the server said; null when it did not say. The chat warns ten minutes before. */
  endsAt: string | null;
  signIn(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Calls the API with the session token; a 401 signs the person out. */
  call<T>(request: (token: string) => Promise<T>): Promise<T>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  // The token of the sign-in in use. A request still running for one that has ended, because the person signed
  // out meanwhile, expects its 401: that must not say their session ended, or sign out whoever is signed in now.
  const current = useRef<string | null>(null);

  const forget = useCallback(async (reason: string | null) => {
    current.current = null;
    await Promise.all([deleteItem('token'), deleteItem('user'), deleteItem('sessionEndsAt')]);
    setToken(null);
    setUser(null);
    setEndsAt(null);
    setNotice(reason);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    (async () => {
      // The installed app's saved server address first: the saved session belongs to that server.
      const [savedToken, savedUser, savedEnd] = await Promise.all([getItem('token'), getItem('user'), getItem('sessionEndsAt'), loadServer()]);
      if (!savedToken) return setStatus('signedOut');
      try {
        const me = await api.me(savedToken);
        await Promise.all([setItem('user', JSON.stringify(me.user)), me.expiresAt ? setItem('sessionEndsAt', me.expiresAt) : Promise.resolve()]);
        setUser(me.user);
        setEndsAt(me.expiresAt ?? savedEnd);
      } catch (error) {
        // Signed out in DCRS by its super admin (DCRS REQUIREMENTS §106): the sign-in screen says so in DCRS's words.
        if (error instanceof ApiError && error.status === 401) return forget(error.code === 'session_ended' ? error.message : null);
        // Offline or server down: keep the session and let the first request decide.
        if (!savedUser) return forget(null);
        setUser(JSON.parse(savedUser) as CurrentUser);
        setEndsAt(savedEnd);
      }
      current.current = savedToken;
      setToken(savedToken);
      setStatus('signedIn');
    })();
  }, [forget]);

  const signIn = useCallback(async (username: string, password: string) => {
    // In the person's language, so DCRS's refusal (one device too many, its hours) comes in it, unchanged.
    const result = await api.login({ username, password, device: await deviceInfo() }, pushLanguage(replyLanguage(), deviceLocale()));
    // A new sign-in: the phone registers for DCRS's alerts again under it (DCRS forgets a phone whose sign-in it ended),
    // and the session's end is kept for the warning before it.
    await Promise.all([
      setItem('token', result.token),
      setItem('user', JSON.stringify(result.user)),
      result.expiresAt ? setItem('sessionEndsAt', result.expiresAt) : deleteItem('sessionEndsAt'),
      newSignIn(),
    ]);
    current.current = result.token;
    setToken(result.token);
    setUser(result.user);
    setEndsAt(result.expiresAt ?? null);
    setNotice(null);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    current.current = null;
    // This phone stops getting the person's alerts first, while the sign-in still works; never in the way of signing out.
    await unregister(token).catch(() => undefined);
    if (token) await api.logout(token).catch(() => undefined);
    await forget(null);
  }, [token, forget]);

  const call = useCallback(
    async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
      if (!token || token !== current.current) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.');
      try {
        return await request(token);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && token === current.current) await forget(error.message);
        throw error;
      }
    },
    [token, forget],
  );

  const value = useMemo(() => ({ status, user, notice, endsAt, signIn, signOut, call }), [status, user, notice, endsAt, signIn, signOut, call]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
