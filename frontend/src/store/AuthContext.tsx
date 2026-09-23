import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, type AuthResponse, type ServerFeatures } from "../api/client";
import { setDepartmentScope } from "../engine/departmentScope";
import { setFeatures } from "../engine/features";
import { SESSION_ENDED_EVENT, stopServerSync } from "../data/serverSync";
import type { AuthUser } from "../types/auth";

// "unreachable": the server (or its database) did not answer whether anyone is
// signed in — not the same as nobody being signed in, so it is not shown the
// sign-in screen (main.tsx says so, with Try again).
type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "unreachable";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, departments?: string[]) => Promise<void>;
  logout: () => Promise<void>;
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [mustChange, setMustChange] = useState(false);

  const [check, setCheck] = useState(0);
  // Bumped when the public answer arrives, so the sign-in screen draws again with it.
  const [, setCheckedConfig] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthResponse>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        applySession(res);
        setUser(res.user);
        setMustChange(res.mustChangePassword === true);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (cancelled) return;
        applySession(null);
        setUser(null);
        setMustChange(false);
        const signedOut = err instanceof ApiError && err.status === 401;
        setStatus(signedOut ? "unauthenticated" : "unreachable");
        // NOBODY IS SIGNED IN, and the sign-in screen still has to know whether
        // to offer a way to create an account (REQUIREMENTS §66). This asks the
        // one public question there is — what the server has switched on — and
        // nothing about anybody. Unanswered, everything stays off, which is the
        // safe way round: no way in that the server would refuse anyway.
        if (signedOut) {
          void api
            .get<{ features?: ServerFeatures }>("/auth/config")
            .then((cfg) => {
              if (!cancelled) {
                setFeatures(cfg.features);
                setCheckedConfig((n) => n + 1);
              }
            })
            .catch(() => undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [check]);

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

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", { email, password });
    applySession(res);
    setUser(res.user);
    setMustChange(res.mustChangePassword === true);
    setStatus("authenticated");
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string, departments?: string[]) => {
    const res = await api.post<AuthResponse>("/auth/signup", { name, email, password, departments: departments ?? [] });
    applySession(res);
    setUser(res.user);
    setMustChange(res.mustChangePassword === true);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      // What is still on its way to the database goes before the session ends.
      await stopServerSync();
      await api.post("/auth/logout");
    } finally {
      applySession(null);
      setUser(null);
      setMustChange(false);
      setStatus("unauthenticated");
    }
  }, []);

  const passwordChosen = useCallback(() => setMustChange(false), []);

  return (
    <AuthContext.Provider value={{ user, status, login, signup, logout, retry, mustChangePassword: mustChange, passwordChosen }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
