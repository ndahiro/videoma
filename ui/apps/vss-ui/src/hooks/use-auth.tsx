"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  isAuthenticated: boolean;
  logout: () => void;
  user: any | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Routes that render without a session: the marketing site and the auth
 * screens. Everything else is console territory and is also gated on the
 * server by (dashboard)/layout.tsx.
 */
const PUBLIC_PREFIXES = [
  "/", // exact match only — see isPublicRoute
  "/pricing",
  "/contact",
  "/terms",
  "/privacy",
  "/login",
  "/register",
  "/onboarding",
];

export function isPublicRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some(
    (prefix) => prefix !== "/" && (pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("vss_token");
    }
    return null;
  });

  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  useEffect(() => {
    setAuthTokenGetter(() => {
      return localStorage.getItem("vss_token");
    });
  }, []);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("vss_token", newToken);
    } else {
      localStorage.removeItem("vss_token");
    }
    setTokenState(newToken);
  };

  const logout = () => {
    // Drop the httpOnly session cookie too, so the server-side gating in
    // (dashboard)/layout.tsx sees the sign-out immediately.
    void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    queryClient.clear();
    router.push("/login");
  };

  const { data: user, isError } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (isError) {
      logout();
    }
  }, [isError]);

  useEffect(() => {
    // Public surface (marketing site + auth screens) never redirects.
    if (isPublicRoute(pathname)) return;
    if (!token) {
      router.push("/login");
    }
  }, [token, pathname, router]);

  return (
    <AuthContext.Provider value={{ token, setToken, isAuthenticated: !!token, logout, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
