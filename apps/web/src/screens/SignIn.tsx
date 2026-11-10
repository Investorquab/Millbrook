import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./SignIn.css";

/**
 * Sign in — ported from `design/screenshots/SignIn.png`. Email and a username,
 * no wallet: a magic link signs the player in and their town's money lives on
 * NEAR in the background. Copy and tokens are taken verbatim from the design.
 *
 * The real magic-link email and NEAR sub-account creation land in M3; for now
 * "Send login link" takes a filled-in form to the Home hub so the flow works.
 */
export function SignIn() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const ready = email.trim().length > 0 && username.trim().length > 0;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    // TODO(M3): POST to /auth/magic-link, create the NEAR sub-account, then
    // land on the hub once the link is confirmed.
    navigate("/hub");
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <span className="signin__hint">Shown on scoreboards, in chat and in the Gazette.</span>
        </div>

        <button type="submit" className="signin__submit" disabled={!ready}>
          Send login link
        </button>

        <p className="signin__guest">
          Just looking? <Link to="/play">Play solo as a guest</Link>
        </p>
      </form>
    </div>
  );
}
