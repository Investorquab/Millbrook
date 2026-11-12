import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../game/AuthProvider";
import "./SignIn.css";

/**
 * Sign in — ported from `design/screenshots/SignIn.png`. Email and a username,
 * no wallet: a magic link signs the player in and their town's money lives on
 * NEAR in the background. Copy and tokens are taken verbatim from the design.
 *
 * The link is sent by {@link useAuth}: the server emails it (Resend) when a key
 * is configured, and otherwise returns it here in development so the flow still
 * works. Clicking the link lands on `/auth/verify`, which mints the session.
 */
export function SignIn() {
  const navigate = useNavigate();
  const { requestLink, isSignedIn, username, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ delivered: boolean; devLink?: string } | null>(null);
  const ready = email.trim().length > 0 && name.trim().length > 0 && status !== "sending";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setStatus("sending");
    setError(null);
    const res = await requestLink(email.trim(), name.trim());
    if (!res.ok) {
      setError(res.error ?? "Could not send the link.");
      setStatus("idle");
      return;
    }
    setSent({ delivered: !!res.delivered, devLink: res.devLink });
    setStatus("sent");
  }

  return (
    <div className="signin">
      <div className="signin__scene" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>

      <Link to="/" className="signin__back">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M11 3L5 9l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        Back
      </Link>

      {isSignedIn ? (
        <div className="signin__card">
          <div className="signin__head">
            <img className="signin__face" src="/art/face-ada.svg" alt="Ada the baker" />
            <h1 className="signin__title">You're signed in</h1>
          </div>
          <p className="signin__lede">
            Signed in as <strong>{username}</strong>. Host or join a room from the hub.
          </p>
          <button type="button" className="signin__submit" onClick={() => navigate("/hub")}>
            Go to the hub
          </button>
          <p className="signin__guest">
            Not you? <button type="button" className="signin__linkbtn" onClick={signOut}>Sign out</button>
          </p>
        </div>
      ) : status === "sent" ? (
        <div className="signin__card">
          <div className="signin__head">
            <img className="signin__face" src="/art/face-ada.svg" alt="Ada the baker" />
            <h1 className="signin__title">Check your email</h1>
          </div>
          <p className="signin__lede">
            {sent?.delivered
              ? `We sent a sign-in link to ${email}. Click it to finish — it works once and expires in 15 minutes.`
              : `Your link is ready for ${email}. (Email delivery isn't configured here, so use the link below.)`}
          </p>
          {sent?.devLink && (
            <Link to={devPath(sent.devLink)} className="signin__submit signin__submit--link">
              Open your sign-in link
            </Link>
          )}
          <p className="signin__guest">
            Wrong address?{" "}
            <button type="button" className="signin__linkbtn" onClick={() => setStatus("idle")}>
              Try again
            </button>
          </p>
        </div>
      ) : (
        <form className="signin__card" onSubmit={onSubmit}>
          <div className="signin__head">
            <img className="signin__face" src="/art/face-ada.svg" alt="Ada the baker" />
            <h1 className="signin__title">Welcome to Millbrook</h1>
          </div>

          <p className="signin__lede">
            No wallet needed. We'll email you a link to sign in, and your town keeps its money on NEAR in the background.
          </p>

          <div className="signin__field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="signin__field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="The name rivals will see"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="signin__hint">Shown on scoreboards, in chat and in the Gazette.</span>
          </div>

          {error && <p className="signin__error">{error}</p>}

          <button type="submit" className="signin__submit" disabled={!ready}>
            {status === "sending" ? "Sending…" : "Send login link"}
          </button>

          <p className="signin__guest">
            Just looking? <Link to="/play">Play solo as a guest</Link>
          </p>
        </form>
      )}
    </div>
  );
}

/** Turn an absolute or relative dev link into a router path (keeps the token). */
function devPath(link: string): string {
  try {
    const u = new URL(link, window.location.origin);
    return `${u.pathname}${u.search}`;
  } catch {
    return link.startsWith("/") ? link : `/auth/verify?${link.split("?")[1] ?? ""}`;
  }
}
