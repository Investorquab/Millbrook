import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as createClient, type Socket } from "socket.io-client";
import { createGameServer, type GameServer } from "./server.js";
import { AuthStore } from "./auth.js";
import type { RoomState } from "./rooms.js";

let server: GameServer;
let url: string;

beforeAll(async () => {
  // Non-prod (default) so /api/auth/request returns the dev link in the body.
  server = createGameServer({
    dayMs: 50,
    auth: new AuthStore({ publicBaseUrl: "http://localhost/app" }),
  });
  const port = await server.listen(0);
  url = `http://localhost:${port}`;
});

afterAll(async () => {
  await server.close();
});

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(url + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

/** Run the magic-link flow and return a session id. */
async function signIn(email: string, username: string): Promise<string> {
  const req = await post("/api/auth/request", { email, username });
  expect(req.status).toBe(200);
  const token = new URL(req.json.devLink).searchParams.get("token");
  const ver = await post("/api/auth/verify", { token });
  expect(ver.status).toBe(200);
  return ver.json.sessionId as string;
}

describe("magic-link auth routes", () => {
  it("requests a link, verifies it, and returns a session", async () => {
    const req = await post("/api/auth/request", { email: "ada@example.com", username: "Ada" });
    expect(req.json.ok).toBe(true);
    expect(typeof req.json.devLink).toBe("string");

    const token = new URL(req.json.devLink).searchParams.get("token")!;
    const ver = await post("/api/auth/verify", { token });
    expect(ver.json).toMatchObject({ ok: true, username: "Ada", email: "ada@example.com" });
    expect(typeof ver.json.sessionId).toBe("string");
  });

  it("rejects a bad email and a used/own token", async () => {
    expect((await post("/api/auth/request", { email: "nope", username: "Ada" })).status).toBe(400);
    expect((await post("/api/auth/verify", { token: "garbage" })).status).toBe(400);
  });

  it("/api/auth/me returns the signed-in user with a bearer session", async () => {
    const sessionId = await signIn("tom@example.com", "Tom");
    const res = await fetch(url + "/api/auth/me", { headers: { authorization: `Bearer ${sessionId}` } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { username: string }).username).toBe("Tom");
  });

  it("a socket with a session uses its username, ignoring a spoofed payload name", async () => {
    const sessionId = await signIn("real@example.com", "RealName");
    const c: Socket = createClient(url, { transports: ["websocket"], forceNew: true, auth: { sessionId } });
    c.emit("room:create", { name: "Spoofer", seed: 42 });
    const state = await new Promise<RoomState>((resolve) => c.once("room:state", resolve));
    expect(state.players[0]!.name).toBe("RealName");
    c.close();
  });
});
