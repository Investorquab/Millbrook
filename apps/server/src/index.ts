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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameServer, type GameServerOptions } from "./server.js";
import { AuthStore, makeEmailSender, pickEmailProvider } from "./auth.js";
import { SettlementService, nearConfigFromEnv } from "./settlement-service.js";
import { aiConfigFromEnv } from "./gazette-ai.js";

const PORT = Number(process.env.PORT ?? 8080);
const isProd = process.env.NODE_ENV === "production";

const opts: GameServerOptions = {
  isProd,
  auth: new AuthStore({ publicBaseUrl: process.env.PUBLIC_BASE_URL }),
};

const emailKey = process.env.EMAIL_API_KEY?.trim();
const emailFrom = process.env.EMAIL_FROM?.trim();
if (emailKey && emailFrom) {
  opts.email = makeEmailSender(emailKey, emailFrom);
  console.log(`Email delivery: ${pickEmailProvider(emailKey)}, from ${emailFrom}`);
} else {
  console.log("Email delivery: none configured — magic links print to this console (dev).");
}
if (!process.env.PUBLIC_BASE_URL) {
  console.log("PUBLIC_BASE_URL is unset — set it to the web origin so links resolve (e.g. https://your-domain).");
}

// Live on-chain settlement (Step 3.5): opt-in via SETTLE_ONCHAIN=1 + NEAR creds.
// Falls back to the repo .env for local dev; on the VPS the creds come from env.
const readRepoEnv = (): Record<string, string> => {
  try {
    const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
    const text = readFileSync(join(root, ".env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]!] = m[2]!.trim();
    }
    return out;
  } catch {
    return {};
  }
};
const settlement = new SettlementService(nearConfigFromEnv(readRepoEnv));
opts.settlement = settlement;
console.log(
  settlement.enabled
    ? "On-chain settlement: ON — the first live room settles to the contract as it plays."
    : "On-chain settlement: off (set SETTLE_ONCHAIN=1 with NEAR operator creds to enable).",
);

// The Gazette is written by NEAR AI when a key is configured, else the template.
const ai = aiConfigFromEnv(readRepoEnv());
opts.ai = ai;
console.log(
  ai
    ? `Gazette: NEAR AI (${ai.model}) with the template as fallback.`
    : "Gazette: template only (set NEAR_AI_API_KEY to let NEAR AI write it).",
);

const server = createGameServer(opts);
server.listen(PORT).then((port) => {
  console.log(`Millbrook server on http://localhost:${port}  (health: /health, rooms: /rooms, auth: /api/auth/*)`);
});
