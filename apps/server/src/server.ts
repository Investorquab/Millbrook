/**
 * The Millbrook game server, as a factory so it can be booted for real
 * (`index.ts`) or in a test on an ephemeral port.
 *
 * One Node process holds every room's live season and talks to the web clients
 * over Socket.IO. HTTP serves a health check and a room listing; everything
 * real-time (join, start, play, actions, the live view) is a socket event.
 */

import { createServer as createHttp, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "socket.io";
import { RoomManager, type Room } from "./rooms.js";
import { ROOM_DAY_MS, type ClientToServer, type GameAction, type ServerToClient } from "./protocol.js";
import { AuthStore, magicLinkEmail, type EmailSender } from "./auth.js";

export interface GameServer {
  http: ReturnType<typeof createHttp>;
  io: Server<ClientToServer, ServerToClient>;
  rooms: RoomManager;
  auth: AuthStore;
  /** Listen on a port (0 = ephemeral); resolves with the bound port. */
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
}

export interface GameServerOptions {
  dayMs?: number;
  /** Inject an auth store (tests); otherwise one is created from env. */
  auth?: AuthStore;
  /** How to deliver a magic link; omitted → log it to the console (dev). */
  email?: EmailSender;
  /** Production hides the dev link from HTTP responses; dev returns it so the
   *  flow is testable without a working email provider. */
  isProd?: boolean;
}

export function createGameServer(opts: GameServerOptions = {}): GameServer {
  const dayMs = opts.dayMs ?? ROOM_DAY_MS;
  const rooms = new RoomManager();
  const auth = opts.auth ?? new AuthStore({ publicBaseUrl: process.env.PUBLIC_BASE_URL });
  const email = opts.email;
  const isProd = opts.isProd ?? false;
  const playing = new Set<string>();

  const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
  };
  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", ...CORS });
    res.end(JSON.stringify(body));
  };
  const readBody = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolve) => {
      let data = "";
      req.on("data", (c) => {
        data += c;
        if (data.length > 10_000) req.destroy(); // cap: these payloads are tiny
      });
      req.on("end", () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch {
          resolve(null);
        }
      });
      req.on("error", () => resolve(null));
    });

  /** Deliver a magic link by email, falling back to the server console. */
  async function deliverLink(link: string, to: string, username: string): Promise<boolean> {
    const body = magicLinkEmail(link, username);
    if (email) {
      const r = await email({ to, ...body });
      if (r.ok) return true;
      console.warn(`[auth] email send failed (${r.info ?? "unknown"}); link for ${to}: ${link}`);
      return false;
    }
    console.log(`[auth] magic link for ${to}: ${link}`);
    return false;
  }

  const http = createHttp((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "";
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS);
      res.end();
      return;
    }
    if (req.method === "GET" && url === "/health") {
      sendJson(res, 200, { ok: true, rooms: rooms.size, uptime: process.uptime() });
      return;
    }
    if (req.method === "GET" && url === "/rooms") {
      sendJson(res, 200, { rooms: rooms.list() });
      return;
    }

    // ── Magic-link sign-in ───────────────────────────────────────────────────
    if (req.method === "POST" && url === "/api/auth/request") {
      void (async () => {
        const body = (await readBody(req)) as { email?: string; username?: string } | null;
        if (!body) return sendJson(res, 400, { error: "Bad request." });
        let link;
        try {
          link = auth.requestLink(body.email ?? "", body.username ?? "");
        } catch (e) {
          return sendJson(res, 400, { error: (e as Error).message });
        }
        const delivered = link.link ? await deliverLink(link.link, link.email, link.username) : false;
        // Surface the link in the response when it was NOT emailed: always in dev,
        // and in production only as a fallback when delivery failed (no provider
        // configured, or a recipient the provider won't send to yet). A link that
        // WAS emailed is never returned — the email is the only copy.
        const devLink =
          !isProd || !delivered ? link.link || `/auth/verify?token=${encodeURIComponent(link.token)}` : undefined;
        sendJson(res, 200, { ok: true, delivered, ...(devLink ? { devLink } : {}) });
      })();
      return;
    }
    if (req.method === "POST" && url === "/api/auth/verify") {
      void (async () => {
        const body = (await readBody(req)) as { token?: string } | null;
        const session = body?.token ? auth.verify(body.token) : null;
        if (!session) return sendJson(res, 400, { error: "This link is invalid or has expired." });
        sendJson(res, 200, { ok: true, ...session });
      })();
      return;
    }
    if (req.method === "GET" && url === "/api/auth/me") {
      const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      const session = auth.session(token);
      if (!session) return sendJson(res, 401, { error: "Not signed in." });
      sendJson(res, 200, { username: session.username, email: session.email });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });

  const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: "*" } });

  const broadcast = (room: Room) => {
    io.to(room.id).emit("room:state", room.state());
    // The shared 3D town, once for the whole room.
    io.to(room.id).emit("game:town", room.townSnapshot());
    // Each player sees their own shop; spectators (no claim) watch the bakery.
    for (const p of room.playerList) {
      io.to(p.id).emit("game:view", room.viewFor(p.workshopId));
    }
  };
  const emitChat = (room: Room, msg: ReturnType<Room["note"]>) => io.to(room.id).emit("chat:message", msg);
  const emitOffers = (room: Room) => io.to(room.id).emit("trade:offers", room.openOffers());
  const roomOf = (roomId: unknown): Room | undefined =>
    typeof roomId === "string" ? rooms.get(roomId) : undefined;

  io.on("connection", (socket) => {
    // If the client presented a valid session, trust its username over whatever
    // the room:create/join payload claims (so names can't be spoofed).
    const session = auth.session(
      typeof socket.handshake.auth?.sessionId === "string" ? socket.handshake.auth.sessionId : undefined,
    );
    if (session) {
      socket.data.name = session.username;
      socket.data.email = session.email;
    }
    const nameFrom = (claimed: string) => (session ? session.username : claimed);

    socket.on("room:create", ({ name, seed }) => {
      const resolved = nameFrom(name);
      socket.data.name = resolved;
      const room = rooms.create(socket.id, resolved, seed);
      socket.data.roomId = room.id;
      void socket.join(room.id);
      broadcast(room);
    });

    socket.on("room:join", ({ code, name }) => {
      const resolved = nameFrom(name);
      socket.data.name = resolved;
      const room = rooms.join(code, socket.id, resolved);
      if (!room) {
        socket.emit("error", { message: `No open room with code ${code}.` });
        return;
      }
      socket.data.roomId = room.id;
      void socket.join(room.id);
      // Hand the newcomer the recent chat and open offers, then announce them.
      socket.emit("chat:history", room.chatHistory());
      socket.emit("trade:offers", room.openOffers());
      broadcast(room);
      emitChat(room, room.note(`${resolved} joined the room.`));
    });

    socket.on("room:claim", ({ type }) => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      if (room.claim(socket.id, type)) {
        broadcast(room);
        emitChat(room, room.note(`${socket.data.name ?? "A player"} is running the ${type}.`));
      } else socket.emit("error", { message: `The ${type} is already taken.` });
    });

    socket.on("chat:send", ({ text }) => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      const msg = room.postChat(socket.id, text);
      if (msg) emitChat(room, msg);
    });

    socket.on("trade:offer", ({ qty, coins, toPlayerId }) => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      const { offer, error } = room.makeOffer(socket.id, { qty, coins, toPlayerId });
      if (error) {
        socket.emit("error", { message: error });
        return;
      }
      emitOffers(room);
      if (offer) {
        const who = offer.toPlayerId ? `${room.nameOf(offer.toPlayerId) ?? "a player"}` : "the room";
        emitChat(room, room.note(`${offer.fromName} offers ${who} ${offer.qty} ${offer.good} for ${offer.coins} coins.`));
      }
    });

    socket.on("trade:accept", ({ offerId }) => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      const res = room.acceptOffer(socket.id, offerId);
      if (!res.ok) {
        socket.emit("error", { message: res.reason });
        return;
      }
      emitOffers(room);
      broadcast(room);
      if (res.offer) {
        emitChat(room, room.note(`${room.nameOf(socket.id) ?? "A player"} accepted ${res.offer.fromName}'s offer: ${res.offer.qty} ${res.offer.good} for ${res.offer.coins} coins.`));
      }
    });

    socket.on("trade:decline", ({ offerId }) => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      if (room.declineOffer(socket.id, offerId)) emitOffers(room);
    });

    socket.on("room:start", () => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      if (room.hostId !== socket.id) {
        socket.emit("error", { message: "Only the host can start the town." });
        return;
      }
      if (room.start()) {
        playing.add(room.id);
        broadcast(room);
        emitChat(room, room.note("The season has begun."));
      }
    });

    socket.on("game:play", () => {
      const room = roomOf(socket.data.roomId);
      if (room && room.status === "live") playing.add(room.id);
    });

    socket.on("game:pause", () => {
      if (socket.data.roomId) playing.delete(socket.data.roomId as string);
    });

    socket.on("game:action", (action: GameAction) => {
      const room = roomOf(socket.data.roomId);
      if (!room) return;
      const workshopId = room.workshopOf(socket.id);
      if (!workshopId) return; // spectators without a shop can't act
      applyAction(room, workshopId, action);
      broadcast(room);
    });

    socket.on("room:leave", () => leave());
    socket.on("disconnect", () => leave());

    function leave(): void {
      const roomId = socket.data.roomId as string | undefined;
      if (!roomId) return;
      const name = socket.data.name as string | undefined;
      const room = rooms.leaveAll(socket.id);
      void socket.leave(roomId);
      socket.data.roomId = undefined;
      if (!room) playing.delete(roomId);
      else {
        broadcast(room);
        emitChat(room, room.note(`${name ?? "A player"} left the room.`));
      }
    }
  });

  // The tick: advance every live room one game day.
  const tick = setInterval(() => {
    for (const id of playing) {
      const room = rooms.get(id);
      if (!room || room.status !== "live") {
        playing.delete(id);
        continue;
      }
      const wasLive = room.status === "live";
      room.step();
      // Game Master events post into the room chat as they happen, so the whole
      // room reacts together (the design's "town events in chat").
      for (const ev of room.drainNewGmEvents()) {
        emitChat(room, room.note(`Game Master: ${ev.title} — ${ev.effect}`));
      }
      broadcast(room);
      if (room.view().ended) {
        if (wasLive) {
          const winner = room.state().standings[0];
          if (winner) emitChat(room, room.note(`The season has ended. ${winner.name} tops the town.`));
        }
        playing.delete(id);
      }
    }
  }, dayMs);
  tick.unref?.();

  return {
    http,
    io,
    rooms,
    auth,
    listen: (port) =>
      new Promise<number>((resolve) => {
        http.listen(port, () => {
          const addr = http.address();
          resolve(typeof addr === "object" && addr ? addr.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(tick);
        io.close(() => http.close(() => resolve()));
      }),
  };
}

function applyAction(room: Room, workshopId: string, action: GameAction): void {
  switch (action.type) {
    case "setPrice":
      room.session.setPrice(action.value, workshopId);
      break;
    case "setWage":
      room.session.setWage(action.value, workshopId);
      break;
    case "hire":
      room.session.hire(workshopId);
      break;
  }
}
