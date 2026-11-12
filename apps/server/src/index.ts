/**
 * Boot the Millbrook game server.
 *
 *   pnpm --filter @millbrook/server dev     # watch mode
 *   pnpm --filter @millbrook/server start
 *
 * Rooms and sessions live in memory for now; Postgres persistence (so a restart
 * loses nothing) is the next step. Settlement to NEAR runs through
 * settle-client.ts. Sign-in is a passwordless magic link (see auth.ts): a valid
 * EMAIL_API_KEY (Resend) sends it by email; without one, the link is logged to
 * this console so the flow still works in development.
 */

import { createGameServer, type GameServerOptions } from "./server.js";
import { AuthStore, makeResendSender } from "./auth.js";

const PORT = Number(process.env.PORT ?? 8080);
const isProd = process.env.NODE_ENV === "production";

const opts: GameServerOptions = {
  isProd,
  auth: new AuthStore({ publicBaseUrl: process.env.PUBLIC_BASE_URL }),
};

const emailKey = process.env.EMAIL_API_KEY?.trim();
const emailFrom = process.env.EMAIL_FROM?.trim();
if (emailKey && emailFrom) {
  opts.email = makeResendSender(emailKey, emailFrom);
  console.log(`Email delivery: Resend, from ${emailFrom}`);
} else {
  console.log("Email delivery: none configured — magic links print to this console (dev).");
}
if (!process.env.PUBLIC_BASE_URL) {
  console.log("PUBLIC_BASE_URL is unset — set it to the web origin so links resolve (e.g. https://your-domain).");
}

const server = createGameServer(opts);
server.listen(PORT).then((port) => {
  console.log(`Millbrook server on http://localhost:${port}  (health: /health, rooms: /rooms, auth: /api/auth/*)`);
});
