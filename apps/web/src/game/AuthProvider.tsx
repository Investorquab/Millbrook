import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiUrl } from "./serverUrl";

/**
 * Passwordless sign-in on the client. Mirrors the server's magic-link flow
 * (apps/server/src/auth.ts): request a link, click it, and the verify step mints
 * a session that we keep in localStorage. The session's username is the player's
 * identity in rooms, chat and on scoreboards.
 *
 * Solo play never needs this — only hosting or joining a room does — so a signed
 * -out visitor can still play as a guest.
 */

export interface Session {
  sessionId: string;
  username: string;
  email: string;
}

const STORAGE_KEY = "millbrook.session.v1";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s && typeof s.sessionId === "string" && typeof s.username === "string") return s;
  } catch {
    /* private mode / blocked storage — treat as signed out */
  }
  return null;
}

function saveSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export interface RequestResult {
  ok: boolean;
  /** True if an email was actually sent (a provider key is configured). */
  delivered?: boolean;
  /** In development, the link is returned so you can click it without email. */
  devLink?: string;
  error?: string;
}

export interface AuthController {
  session: Session | null;
  username: string | null;
  isSignedIn: boolean;
  /** Ask the server to email a one-time sign-in link. */
  requestLink: (email: string, username: string) => Promise<RequestResult>;
  /** Redeem a token from the emailed link; stores the session on success. */
  verify: (token: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthController | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const requestLink = useCallback(async (email: string, username: string): Promise<RequestResult> => {
    try {
      const res = await fetch(apiUrl("/api/auth/request"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, username }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? "Could not send the link." };
      return { ok: true, delivered: !!data.delivered, devLink: data.devLink };
    } catch {
      return { ok: false, error: "Can't reach the server. Multiplayer sign-in needs it running." };
    }
  }, []);

  const verify = useCallback(async (token: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch(apiUrl("/api/auth/verify"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data.error ?? "This link is invalid or has expired." };
      const next: Session = { sessionId: data.sessionId, username: data.username, email: data.email };
      saveSession(next);
      setSession(next);
      return { ok: true };
    } catch {
      return { ok: false, error: "Can't reach the server to sign you in." };
    }
  }, []);

  const signOut = useCallback(() => {
    saveSession(null);
    setSession(null);
  }, []);

  const value = useMemo<AuthController>(
    () => ({
      session,
      username: session?.username ?? null,
      isSignedIn: !!session,
      requestLink,
      verify,
      signOut,
    }),
    [session, requestLink, verify, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthController {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
