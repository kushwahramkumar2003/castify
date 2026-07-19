"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useRouter } from "next/navigation";
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
  /** Clears httpOnly cookie via API, local state, and redirects to login */
  logout: () => Promise<void>;
  /** Re-fetch fresh profile data from GET /user/me and update state. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
  });
  const router = useRouter();

  // On mount: hit /me — the HTTP-only cookie is sent automatically.
  // A 401 means not logged in; we just set isLoading: false.
  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((res) => {
        if (!cancelled) setState({ user: res.data, isLoading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, isLoading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    // Server returns user fields flat on res.data (no nested .user key).
    // It also sets an HTTP-only cookie in the response — nothing to store locally.
    const res = await api.login(email, password);
    setState({ user: res.data, isLoading: false });
    toast.success(`Welcome back, ${res.data.username}!`);
  }, []);

  const signup = useCallback(
    async (data: {
      username: string;
      fullName: string;
      email: string;
      password: string;
    }) => {
      await api.signup(data);
      const meRes = await api.getMe();
      setState({ user: meRes.data, isLoading: false });
      toast.success("Account created! Welcome to Castify 🎉");
    },
    []
  );

  const logout = useCallback(async () => {
    // 1) Server must clear castify_token (httpOnly) — await so Set-Cookie lands
    try {
      await api.logout();
    } catch {
      // Still clear local state even if network fails
    }
    // 2) Drop chat JWT (localStorage / memory)
    try {
      const chat = await import("@/lib/chat-client");
      chat.clearChatAccessToken();
    } catch {
      /* ignore */
    }
    // 3) Clear in-memory session
    setState({ user: null, isLoading: false });
    toast.success("Logged out successfully");
    // 4) Leave protected routes (dashboard layout only redirects on !user)
    router.replace("/login");
    router.refresh();
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      setState((s) => ({ ...s, user: res.data, isLoading: false }));
    } catch {
      setState({ user: null, isLoading: false });
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, login, signup, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
