/**
 * @fileType context
 * @domain kody
 *
 * Auth context for reading stored GitHub credentials from localStorage.
 *
 * On login: credentials stored in localStorage as JSON.
 * On logout: credentials cleared from localStorage.
 *
 * API routes read the token from a custom header set by the client
 * (x-kody-token, x-kody-owner, x-kody-repo) instead of env vars.
 */
"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface KodyAuth {
  repoUrl: string;
  owner: string;
  repo: string;
  token: string;
  user: {
    login: string;
    avatar_url: string;
    id: number;
  };
  loggedInAt: number;
}

interface AuthContextValue {
  auth: KodyAuth | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  auth: null,
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<KodyAuth | null>(null);
  const [loading, setLoading] = useState(true);

  // Load auth from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("kody_auth");
      if (stored) {
        setAuth(JSON.parse(stored) as KodyAuth);
      }
    } catch {
      // Corrupted localStorage — clear it
      localStorage.removeItem("kody_auth");
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("kody_auth");
    setAuth(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ auth, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * Build authorization headers from localStorage auth.
 * Use this in API route client-side calls.
 */
export function buildAuthHeaders(auth: KodyAuth | null): Record<string, string> {
  if (!auth) return {};
  return {
    "x-kody-token": auth.token,
    "x-kody-owner": auth.owner,
    "x-kody-repo": auth.repo,
  };
}
