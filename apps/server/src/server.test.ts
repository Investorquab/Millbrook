import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createGameServer, type GameServer } from "./server.js";
import type { RoomState } from "./rooms.js";
import type { SoloView } from "@millbrook/economy";

let server: GameServer;
let url: string;

beforeAll(async () => {
  server = createGameServer({ dayMs: 20 }); // fast ticks for the test
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.close();
});

function connect(): Socket {
  return createClient(url, { transports: ["websocket"], forceNew: true });
}

/** Resolve on the next occurrence of an event. */
function once<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe("game server (socket.io)", () => {
  it("creates a room and returns its lobby state", async () => {
    const c = connect();
    c.emit("room:create", { name: "Ada", seed: 42 });
    const state = await once<RoomState>(c, "room:state");
    expect(state.status).toBe("lobby");
    expect(state.players[0]).toMatchObject({ name: "Ada", isHost: true });
    expect(state.code).toMatch(/^[A-Z2-9]{6}$/);
    c.close();
  });

  it("lets a second client join by code and both see two players", async () => {
    const host = connect();
    host.emit("room:create", { name: "Ada", seed: 42 });
    const created = await once<RoomState>(host, "room:state");

    const guest = connect();
    guest.emit("room:join", { code: created.code, name: "Tom" });
    const joined = await once<RoomState>(guest, "room:state");
    expect(joined.players.map((p) => p.name).sort()).toEqual(["Ada", "Tom"]);
    expect(joined.id).toBe(created.id);

    host.close();
    guest.close();
  });

  it("rejects a bad invite code with an error", async () => {
    const c = connect();
    c.emit("room:join", { code: "ZZZZZZ", name: "Nobody" });
    const err = await once<{ message: string }>(c, "error");
    expect(err.message).toMatch(/No open room/);
    c.close();
  });

  it("starts the town and ticks the live view forward", async () => {
    const c = connect();
    c.emit("room:create", { name: "Ada", seed: 42 });
    await once<RoomState>(c, "room:state");

    c.emit("room:start");
    // After start the room is live; the ticker advances the day.
    const firstView = await once<SoloView>(c, "game:view");
    const startDay = firstView.day;

    const laterDay = await new Promise<number>((resolve) => {
      c.on("game:view", (v: SoloView) => {
        if (v.day > startDay) resolve(v.day);
      });
    });
    expect(laterDay).toBeGreaterThan(startDay);
    c.close();
  });

  it("applies a host action (set price) to the live session", async () => {
    const c = connect();
    c.emit("room:create", { name: "Ada", seed: 42 });
    await once<RoomState>(c, "room:state");

    c.emit("game:action", { type: "setPrice", value: 5 });
    const view = await once<SoloView>(c, "game:view");
    expect(view.price).toBe(5);
    c.close();
  });
});
