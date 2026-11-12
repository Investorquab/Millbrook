/**
 * Passwordless, magic-link sign-in for Millbrook.
 *
 * No wallet, no password: a player gives an email and a username, we email them
 * a one-time link, and clicking it mints a session. The store is pure and
 * deterministic (inject `now`/`randomToken` in tests); email delivery is a thin
 * Resend call with a console fallback so the flow works even before a key is
 * set. Sessions live in memory for now — Postgres persistence is the next step.
 *
 * Tokens are single-use, short-lived, and stored only as a SHA-256 hash, so a
 * leak of the store never reveals a usable link.
 */

import { createHash, randomBytes } from "node:crypto";

/** How long a magic link is valid (15 minutes). */
export const TOKEN_TTL_MS = 15 * 60 * 1000;
/** How long a session lasts once signed in (30 days). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Longest username we accept; longer is trimmed. */
export const USERNAME_MAX = 24;

export interface MagicLink {
  /** The raw token (goes in the emailed URL; never stored in the clear). */
  token: string;
  /** The full link to email, if a public base URL is configured. */
  link: string;
  email: string;
  username: string;
}

export interface SessionInfo {
  sessionId: string;
  username: string;
  email: string;
}

interface Pending {
  email: string;
  username: string;
  expiresAt: number;
}
interface Session {
  username: string;
  email: string;
  expiresAt: number;
}

export interface AuthDeps {
  now?: () => number;
  /** Returns a fresh URL-safe token; overridden in tests for determinism. */
  randomToken?: () => string;
  /** The web origin used to build the link, e.g. https://play.example.com. */
  publicBaseUrl?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Trim, strip control characters and cap the length of a username. */
export function cleanUsername(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, USERNAME_MAX);
}

export class AuthStore {
  private readonly pending = new Map<string, Pending>(); // key = sha256(token)
  private readonly sessions = new Map<string, Session>(); // key = sessionId
  private readonly now: () => number;
  private readonly randomToken: () => string;
  private readonly publicBaseUrl: string;

  constructor(deps: AuthDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.randomToken = deps.randomToken ?? (() => randomBytes(24).toString("base64url"));
    this.publicBaseUrl = (deps.publicBaseUrl ?? "").replace(/\/+$/, "");
  }

  /** Create a one-time login link for an email + username. Throws on bad input. */
  requestLink(emailRaw: string, usernameRaw: string): MagicLink {
    const email = String(emailRaw ?? "").trim().toLowerCase();
    const username = cleanUsername(String(usernameRaw ?? ""));
    if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
    if (username.length === 0) throw new Error("Choose a username.");

    this.prune();
    const token = this.randomToken();
    this.pending.set(sha256(token), { email, username, expiresAt: this.now() + TOKEN_TTL_MS });
    const link = this.publicBaseUrl ? `${this.publicBaseUrl}/auth/verify?token=${encodeURIComponent(token)}` : "";
    return { token, link, email, username };
  }

  /** Redeem a token (single use). Returns a new session, or null if invalid. */
  verify(token: string): SessionInfo | null {
    const key = sha256(String(token ?? ""));
    const row = this.pending.get(key);
    if (!row) return null;
    this.pending.delete(key); // single use, even if expired
    if (row.expiresAt < this.now()) return null;

    const sessionId = this.randomToken();
    this.sessions.set(sessionId, {
      username: row.username,
      email: row.email,
      expiresAt: this.now() + SESSION_TTL_MS,
    });
    return { sessionId, username: row.username, email: row.email };
  }

  /** Look up a live session by id, or undefined if missing/expired. */
  session(sessionId: string | undefined): SessionInfo | undefined {
    if (!sessionId) return undefined;
    const row = this.sessions.get(sessionId);
    if (!row) return undefined;
    if (row.expiresAt < this.now()) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    return { sessionId, username: row.username, email: row.email };
  }

  /** Drop expired pending tokens and sessions. */
  private prune(): void {
    const t = this.now();
    for (const [k, v] of this.pending) if (v.expiresAt < t) this.pending.delete(k);
    for (const [k, v] of this.sessions) if (v.expiresAt < t) this.sessions.delete(k);
  }
}

/** A function that delivers one email. */
export type EmailSender = (msg: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<{ ok: boolean; info?: string }>;

/**
 * Build a Resend-backed email sender. Dependency-free (uses `fetch`). Returns
 * `{ ok: false }` with a reason rather than throwing, so a bad key degrades to
 * the console fallback instead of crashing a request.
 */
export function makeResendSender(apiKey: string, from: string): EmailSender {
  return async ({ to, subject, html, text }) => {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, subject, html, text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, info: `Resend HTTP ${res.status} ${body.slice(0, 180)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, info: `Resend unreachable: ${(e as Error)?.message ?? e}` };
    }
  };
}

/** The email body for a magic link — plain and unbranded, so it lands well. */
export function magicLinkEmail(link: string, username: string): { subject: string; html: string; text: string } {
  const subject = "Your Millbrook sign-in link";
  const text =
    `Hi ${username},\n\nClick to sign in to Millbrook:\n${link}\n\n` +
    `This link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`;
  const html =
    `<p>Hi ${escapeHtml(username)},</p>` +
    `<p><a href="${escapeHtml(link)}">Click here to sign in to Millbrook</a></p>` +
    `<p>This link works once and expires in 15 minutes. If you didn't ask for it, you can ignore this email.</p>`;
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
