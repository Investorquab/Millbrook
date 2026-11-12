/**
 * Where the web app reaches the game server (Socket.IO and the auth API).
 *
 * An explicit VITE_SERVER_URL always wins. Otherwise: in dev the server runs on
 * :8080 (the web is on :5173); in a production build we use the SAME ORIGIN ("")
 * so Caddy proxies /socket.io and /api/* to the server on the deploy domain — no
 * build-time URL needed for a one-domain deploy.
 */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:8080" : "");

/** Build an absolute API URL (SERVER_URL may be "" for same-origin). */
export function apiUrl(path: string): string {
  return `${SERVER_URL}${path}`;
}
