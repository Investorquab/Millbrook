import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../game/AuthProvider";
import "./SignIn.css";

/**
 * The magic-link landing page. The emailed link points here with a one-time
 * token; we redeem it for a session and send the player on to the hub. On
 * failure (expired or reused link) we explain and offer to try again.
 */
export function AuthVerify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { verify, username } = useAuth();
  const [state, setState] = useState<"verifying" | "ok" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // guard against double-invoke in StrictMode
    ran.current = true;
    const token = params.get("token");
    if (!token) {
      setState("error");
      setError("This link is missing its token.");
      return;
    }
    void verify(token).then((res) => {
      if (res.ok) {
        setState("ok");
        setTimeout(() => navigate("/hub"), 700);
      } else {
        setState("error");
        setError(res.error ?? "This link is invalid or has expired.");
      }
    });
  }, [params, verify, navigate]);

  return (
    <div className="signin">
      <div className="signin__scene" aria-hidden="true">
        <img src="/art/town.svg" alt="" />
      </div>
      <div className="signin__card">
        <div className="signin__head">
          <img className="signin__face" src="/art/face-ada.svg" alt="Ada the baker" />
          <h1 className="signin__title">
            {state === "verifying" ? "Signing you in…" : state === "ok" ? "Welcome back" : "Link problem"}
          </h1>
        </div>

        {state === "verifying" && <p className="signin__lede">One moment while we check your link.</p>}
        {state === "ok" && (
          <p className="signin__lede">
            Signed in as <strong>{username}</strong>. Taking you to the hub…
          </p>
        )}
        {state === "error" && (
          <>
            <p className="signin__error">{error}</p>
            <Link to="/signin" className="signin__submit signin__submit--link">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
