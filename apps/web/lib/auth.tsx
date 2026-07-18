"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { api, type UserProfile } from "@/lib/api";
import { toast } from "sonner";

// ── State shape ────────────────────────────────────────────────────────────
// No token stored client-side — auth uses an HTTP-only cookie set by the
// server. We keep only the hydrated UserProfile in memory; the cookie is
// sent automatically by the browser on every credentialed request.

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (data: {
    username: string;
    fullName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  /** Re-fetch fresh profile data from GET /user/me and update state. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  // On mount: hit /me — the HTTP-only cookie is sent automatically.
  // A 401 means not logged in; we just set isLoading: false.
  useEffect(() => {
    api
      .getMe()
      .then((res) => setState({ user: res.data, isLoading: false }))
      .catch(() => setState({ user: null, isLoading: false }));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Server returns user fields flat on res.data (no nested .user key).
    // It also sets an HTTP-only cookie in the response — nothing to store locally.
    const res = await api.login(email, password);
    setState({ user: res.data, isLoading: false });
    toast.success(`Welcome back, ${res.data.username}!`);
  }, []);

  const signup = useCallback(
    async (data: { username: string; fullName: string; email: string; password: string }) => {
      // Server returns { token, user: { id, username, fullName, email, createdAt } }
      // and sets an HTTP-only cookie. We immediately call /me to get the full profile.
      await api.signup(data);
      const meRes = await api.getMe();
      setState({ user: meRes.data, isLoading: false });
      toast.success("Account created! Welcome to Castify 🎉");
    },
    []
  );

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    void import("@/lib/chat-client").then((m) => m.clearChatAccessToken());
    setState({ user: null, isLoading: false });
    toast.success("Logged out successfully");
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      setState((s) => ({ ...s, user: res.data }));
    } catch {
      // Session likely expired — clear user.
      setState({ user: null, isLoading: false });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
