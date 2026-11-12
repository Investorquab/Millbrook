import { Link, useRouteError, isRouteErrorResponse } from "react-router-dom";

/**
 * A friendly fallback for two cases, so players never meet React Router's raw
 * "Unexpected Application Error":
 *   • an unmatched path (used as the `*` route) → "Page not found".
 *   • any error thrown while rendering (used as the router `errorElement`) →
 *     "Something went wrong". A reload fetches the latest build, which fixes the
 *     common case of a tab left open across a deploy (stale code chunks).
 */
export function NotFound() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const notFound = is404 || !error;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "0 24px",
        textAlign: "center",
        background: "var(--deep, #1a1f26)",
        color: "var(--linen, #ede6d6)",
      }}
    >
      <img src="/art/town.svg" alt="" aria-hidden="true" style={{ width: "min(360px, 70vw)", opacity: 0.5 }} />
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, margin: 0 }}>
        {notFound ? "That page isn't in Millbrook" : "Something went wrong"}
      </h1>
      <p style={{ color: "var(--text-soft, #b9b2a3)", maxWidth: 460, margin: 0, lineHeight: 1.5 }}>
        {notFound
          ? "The page you were looking for doesn't exist. Head back to town."
          : "An unexpected error occurred. If the app was just updated, reloading will pick up the latest version."}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "12px 22px",
            borderRadius: 12,
            border: "none",
            background: "var(--wheat, #d9a441)",
            color: "var(--millstone, #2a2018)",
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
        <Link
          to="/"
          style={{
            padding: "12px 22px",
            borderRadius: 12,
            border: "1px solid rgba(237,230,214,0.3)",
            color: "var(--linen, #ede6d6)",
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
          }}
        >
          Back to Millbrook
        </Link>
      </div>
    </div>
  );
}
