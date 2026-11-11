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

export interface GameServer {
  http: ReturnType<typeof createHttp>;
  io: Server<ClientToServer, ServerToClient>;
  rooms: RoomManager;
  /** Listen on a port (0 = ephemeral); resolves with the bound port. */
  listen: (port: number) => Promise<number>;
  close: () => Promise<void>;
}

export function createGameServer(opts: { dayMs?: number } = {}): GameServer {
  const dayMs = opts.dayMs ?? ROOM_DAY_MS;
  const rooms = new RoomManager();
  const playing = new Set<string>();

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body));
  };

  const http = createHttp((req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, rooms: rooms.size, uptime: process.uptime() });
      return;
    }
    if (req.method === "GET" && req.url === "/rooms") {
      sendJson(res, 200, { rooms: rooms.list() });
      return;
    }
    sendJson(res, 404, { error: "not found" });
  });

  const io = new Server<ClientToServer, ServerToClient>(http, { cors: { origin: "*" } });

  const broadcast = (room: Room) => {
    io.to(room.id).emit("room:state", room.state());
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
    socket.on("room:create", ({ name, seed }) => {
      socket.data.name = name;
      const room = rooms.create(socket.id, name, seed);
      socket.data.roomId = room.id;
      void socket.join(room.id);
      broadcast(room);
    });

    socket.on("room:join", ({ code, name }) => {
      socket.data.name = name;
      const room = rooms.join(code, socket.id, name);
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
      emitChat(room, room.note(`${name} joined the room.`));
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
      room.step();
      broadcast(room);
      if (room.view().ended) playing.delete(id);
    }
  }, dayMs);
  tick.unref?.();

  return {
    http,
    io,
    rooms,
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
