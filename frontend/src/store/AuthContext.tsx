import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, OUTSIDE_HOURS_EVENT, type AuthResponse, type OutsideHoursDetail, type PublicHours, type ServerFeatures } from "../api/client";
import { setDepartmentScope } from "../engine/departmentScope";
import { setFeatures } from "../engine/features";
import { DEFAULT_PLANT_TIME_ZONE, END_OF_HOURS_REASON, OUTSIDE_HOURS_CODE, OUTSIDE_HOURS_REASON } from "../engine/workingHoursCore";
import { SESSION_ENDED_EVENT, stopServerSync } from "../data/serverSync";
import type { AuthUser } from "../types/auth";

// "unreachable": the server (or its database) did not answer whether anyone is
// signed in — not the same as nobody being signed in, so it is not shown the
// sign-in screen (main.tsx says so, with Try again).
type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "unreachable";

/** Why the browser ended a session by itself (REQUIREMENTS §84, C4) — sent with the sign-out, and written in the activity log. */
export type SignOutReason = typeof END_OF_HOURS_REASON | typeof OUTSIDE_HOURS_REASON;

/**
 * A DAY'S SESSION, as this browser keeps time for it (REQUIREMENTS §84, C3/C4):
 * when it ends by this computer's own clock — the server's `endsAt`, moved by
 * however far this clock is from the server's — and whether the browser signs
 * the person out by itself then (a non-admin while the plant's hours are
 * enforced). components/auth/SessionClock.tsx warns and signs out.
 */
export interface DaySession {
  /** The server's word for the end, ISO. */
  endsAt: string;
  /** The same moment on this computer's clock, in ms. */
  endsAtLocal: number;
  signOutAtEnd: boolean;
  /** The factory's time zone, for saying the time of the close in words. */
  timeZone: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, departments?: string[]) => Promise<void>;
  /** Signs out; `reason` only when the browser does it by itself (the close of the working day). */
  logout: (reason?: SignOutReason) => Promise<void>;
  /** Asks the server again who is signed in (after "unreachable"). */
  retry: () => void;
  /**
   * This account is still on the password the administrator gave it, so it can
   * do nothing until its owner chooses their own (REQUIREMENTS §66). The server
   * refuses the data either way; this is what puts the dialog on screen.
   */
  mustChangePassword: boolean;
  /** Said once they have chosen one, so the app opens. */
  passwordChosen: () => void;
  /** This session's end (§84); null while nobody is signed in, or from a server that does not say. */
  session: DaySession | null;
  /** The plant's hours and where today stands, as the server last said (§84). */
  hours: PublicHours | null;
  /** Asks the server for the hours again (the sign-in page, after a refusal and while it stays open). */
  refreshHours: () => void;
  /** Asks the server about this session again: the calendar may now close the day sooner, or the session may be over. */
  refreshSession: () => Promise<void>;
  /**
   * Ends the session because of the plant's hours: what is still unsent goes
   * first, the sign-out says why, and the sign-in page then shows `notice`.
   */
  endForHours: (reason: SignOutReason, notice: string) => Promise<void>;
  /** Why this browser was last signed out by itself, in words — shown on the sign-in page until somebody signs in. */
  notice: string | null;
}

// WHICH DEPARTMENTS THE PERSON MAY SEE is decided by their own account record
// and applied here, once, the moment we know who they are: the two
// repositories then answer every screen for that scope
// (engine/departmentScope.ts, REQUIREMENTS §40). The administrator and any
// account with no department assigned see everything, which is what keeps a
// brand-new installation usable.
function applyScope(user: AuthUser | null): void {
  setDepartmentScope(user && user.role !== "admin" ? user.departments : null);
}

// WHAT THE SERVER HAS SWITCHED ON comes with the same answer (REQUIREMENTS §65)
// and is set beside the scope, BEFORE the status that lets the app draw: every
// screen then reads engine/features.ts synchronously. Nobody signed in: all off.
function applySession(res: AuthResponse | null): void {
  applyScope(res ? res.user : null);
  setFeatures(res?.features);
}

/** The server's word on a session's end, turned into this computer's time. Null from a server that says nothing. */
function daySessionOf(res: AuthResponse): DaySession | null {
  const s = res.session;
  if (!s || typeof s.endsAt !== "string") return null;
  const end = Date.parse(s.endsAt);
  if (!Number.isFinite(end)) return null;
  const serverNow = Date.parse(s.now);
  const skew = Number.isFinite(serverNow) ? serverNow - Date.now() : 0;
  return { endsAt: s.endsAt, endsAtLocal: end - skew, signOutAtEnd: s.signOutAtEnd === true, timeZone: res.hours?.timeZone ?? DEFAULT_PLANT_TIME_ZONE };
}

const isOutsideHours = (err: unknown): err is ApiError => err instanceof ApiError && err.status === 403 && err.code === OUTSIDE_HOURS_CODE;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [mustChange, setMustChange] = useState(false);
  const [session, setSession] = useState<DaySession | null>(null);
  const [hours, setHours] = useState<PublicHours | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [check, setCheck] = useState(0);
  // Bumped when the public answer arrives, so the sign-in screen draws again with it.
  const [, setCheckedConfig] = useState(0);
  // Read by the listeners below, which are set up once.
  const statusRef = useRef(status);
  statusRef.current = status;
  const userRef = useRef(user);
  userRef.current = user;

  // WHAT THE SERVER ALLOWS, WITH NOBODY SIGNED IN (REQUIREMENTS §66). Asked
  // whenever this browser ends up at the sign-in screen — on the first look, and
  // again after signing out, which resets the features with the session. Without
  // the second, a screen that came back after a sign-out would offer no way to
  // create an account even on a server that allows it. It asks nothing about
  // anybody, and if it goes unanswered everything stays off, which is the safe
  // way round: no way in that the server would refuse anyway. The same answer
  // carries the plant's hours, which the sign-in page states (§84).
  const readPublicFeatures = useCallback(() => {
    void api
      .get<{ features?: ServerFeatures; hours?: PublicHours | null }>("/auth/config")
      .then((cfg) => {
        setFeatures(cfg.features);
        setHours(cfg.hours ?? null);
        setCheckedConfig((n) => n + 1);
      })
      .catch(() => undefined);
  }, []);

  /** Everything a signed-in answer (sign-in, sign-up, /auth/me) says. */
  const applyAnswer = useCallback((res: AuthResponse) => {
    applySession(res);
    setUser(res.user);
    setMustChange(res.mustChangePassword === true);
    setSession(daySessionOf(res));
    if (res.hours !== undefined) setHours(res.hours ?? null);
  }, []);

  const signedOutState = useCallback(() => {
    applySession(null);
    setUser(null);
    setMustChange(false);
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  // OUT BECAUSE OF THE PLANT'S HOURS (§84): what is still on its way to the
  // database goes first, the sign-out says why (the activity log keeps it), and
  // the sign-in page opens with the words. Once, however many things ask.
  const endingForHours = useRef(false);
  const endForHours = useCallback(
    async (reason: SignOutReason, text: string) => {
      if (endingForHours.current) return;
      endingForHours.current = true;
      try {
        await stopServerSync().catch(() => undefined);
        await api.post("/auth/logout", { reason }).catch(() => undefined);
      } finally {
        signedOutState();
        setNotice(text);
        readPublicFeatures();
        endingForHours.current = false;
      }
    },
    [readPublicFeatures, signedOutState]
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthResponse>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        applyAnswer(res);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (cancelled) return;
        // A session still open outside the plant's hours: signed out, with the reason (§84).
        if (isOutsideHours(err)) {
          void endForHours(OUTSIDE_HOURS_REASON, err.message);
          return;
        }
        signedOutState();
        const signedOut = err instanceof ApiError && err.status === 401;
        setStatus(signedOut ? "unauthenticated" : "unreachable");
        if (signedOut) readPublicFeatures();
      });
    return () => {
      cancelled = true;
    };
  }, [check, readPublicFeatures, applyAnswer, endForHours, signedOutState]);

  const retry = useCallback(() => {
    setStatus("checking");
    setCheck((n) => n + 1);
  }, []);

  // The session ran out, or was ended in another tab: the server refuses the
  // stored data (data/serverSync.ts). Back to the sign-in screen — what was
  // still unsent stays marked on this computer and goes at the next sign-in.
  // The same happens when this browser has since signed in as another account
  // (in another tab): asking the server again who is signed in opens the app
  // for that account instead.
  const ending = useRef(false);
  useEffect(() => {
    const onEnded = () => {
      if (ending.current) return;
      ending.current = true;
      void stopServerSync().finally(() => {
        ending.current = false;
        retry();
      });
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, [retry]);

  // REFUSED OUTSIDE THE HOURS, BY ANY ROUTE (api/client.ts): a person held to
  // the hours is signed out to the server's own words. The super admin never is.
  useEffect(() => {
    const onOutside = (e: Event) => {
      const detail = (e as CustomEvent<OutsideHoursDetail>).detail;
      if (statusRef.current !== "authenticated" || !userRef.current || userRef.current.role === "admin") return;
      void endForHours(OUTSIDE_HOURS_REASON, detail?.message || "DCRS is closed now.");
    };
    window.addEventListener(OUTSIDE_HOURS_EVENT, onOutside);
    return () => window.removeEventListener(OUTSIDE_HOURS_EVENT, onOutside);
  }, [endForHours]);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const res = await api.post<AuthResponse>("/auth/login", { email, password });
        applyAnswer(res);
        setNotice(null);
        setStatus("authenticated");
      } catch (err) {
        // Refused outside the hours: the words are the form's to show; the hours beside it are asked again.
        if (isOutsideHours(err)) readPublicFeatures();
        throw err;
      }
    },
    [applyAnswer, readPublicFeatures]
  );

  const signup = useCallback(
    async (name: string, email: string, password: string, departments?: string[]) => {
      const res = await api.post<AuthResponse>("/auth/signup", { name, email, password, departments: departments ?? [] });
      applyAnswer(res);
      setNotice(null);
      setStatus("authenticated");
    },
    [applyAnswer]
  );

  const logout = useCallback(
    async (reason?: SignOutReason) => {
      // Only the two words the server knows; anything else (a click event handed in by mistake) is an ordinary sign-out.
      const why = reason === END_OF_HOURS_REASON || reason === OUTSIDE_HOURS_REASON ? reason : undefined;
      try {
        // What is still on its way to the database goes before the session ends.
        await stopServerSync();
        await api.post("/auth/logout", why ? { reason: why } : undefined);
      } finally {
        signedOutState();
        setNotice(null);
        // The sign-in screen is about to be drawn again: ask what the server allows.
        readPublicFeatures();
      }
    },
    [readPublicFeatures, signedOutState]
  );

  const refreshSession = useCallback(async () => {
    if (statusRef.current !== "authenticated") return;
    try {
      const res = await api.get<AuthResponse>("/auth/me");
      if (statusRef.current !== "authenticated" || res.user?.id !== userRef.current?.id) return;
      setSession(daySessionOf(res));
      if (res.hours !== undefined) setHours(res.hours ?? null);
    } catch (err) {
      // Over: the same way back to the sign-in page as a refused sync. Outside the hours: api/client.ts has said so.
      if (err instanceof ApiError && err.status === 401) window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    }
  }, []);

  const passwordChosen = useCallback(() => setMustChange(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        login,
        signup,
        logout,
        retry,
        mustChangePassword: mustChange,
        passwordChosen,
        session,
        hours,
        refreshHours: readPublicFeatures,
        refreshSession,
        endForHours,
        notice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
