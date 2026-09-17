import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { setDepartmentScope } from "../engine/departmentScope";
import { stopServerSync } from "../data/serverSync";
import type { AuthUser } from "../types/auth";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, departments?: string[]) => Promise<void>;
  logout: () => Promise<void>;
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

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ user: AuthUser }>("/auth/me")
      .then((res) => {
        if (cancelled) return;
        applyScope(res.user);
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (cancelled) return;
        applyScope(null);
        setUser(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: AuthUser }>("/auth/login", { email, password });
    applyScope(res.user);
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string, departments?: string[]) => {
    const res = await api.post<{ user: AuthUser }>("/auth/signup", { name, email, password, departments: departments ?? [] });
    applyScope(res.user);
    setUser(res.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      // What is still on its way to the database goes before the session ends.
      await stopServerSync();
      await api.post("/auth/logout");
    } finally {
      applyScope(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  return <AuthContext.Provider value={{ user, status, login, signup, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
