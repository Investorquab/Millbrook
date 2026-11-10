/**
 * Boot the Millbrook game server.
 *
 *   pnpm --filter @millbrook/server dev     # watch mode
 *   pnpm --filter @millbrook/server start
 *
 * Rooms live in memory for now; Postgres persistence (so a restart loses
 * nothing) is the next step. Settlement to NEAR runs through settle-client.ts.
 */

import { createGameServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 8080);

const server = createGameServer();
server.listen(PORT).then((port) => {
  console.log(`Millbrook server on http://localhost:${port}  (health: /health, rooms: /rooms)`);
});
