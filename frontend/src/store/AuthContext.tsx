import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, ApiError, type AuthResponse } from "../api/client";
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

  const [check, setCheck] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthResponse>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        applySession(res);
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch((err) => {
        if (cancelled) return;
        applySession(null);
        setUser(null);
        setStatus(err instanceof ApiError && err.status === 401 ? "unauthenticated" : "unreachable");
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
    setStatus("authenticated");
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string, departments?: string[]) => {
    const res = await api.post<AuthResponse>("/auth/signup", { name, email, password, departments: departments ?? [] });
    applySession(res);
    setUser(res.user);
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
      setStatus("unauthenticated");
    }
  }, []);

  return <AuthContext.Provider value={{ user, status, login, signup, logout, retry }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
