import { describe, it, expect } from "vitest";
import { RoomManager } from "./rooms.js";

describe("RoomManager", () => {
  it("creates a room in the lobby with the host as the only player", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    expect(room.status).toBe("lobby");
    expect(room.playerCount).toBe(1);
    expect(room.hostId).toBe("host1");
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(room.state().players[0]).toMatchObject({ id: "host1", name: "Ada", isHost: true });
  });

  it("joins by code (case-insensitive) and rejects unknown codes", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    const joined = rm.join(room.code.toLowerCase(), "p2", "Tom");
    expect(joined?.id).toBe(room.id);
    expect(room.playerCount).toBe(2);
    expect(rm.join("ZZZZZZ", "p3", "Mara")).toBeUndefined();
  });

  it("gives every room a distinct invite code", () => {
    const rm = new RoomManager();
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(rm.create(`h${i}`, "H").code);
    expect(codes.size).toBe(50);
  });

  it("starts the season and advances days deterministically by seed", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    expect(room.start()).toBe(true);
    expect(room.start()).toBe(false); // can't start twice
    expect(room.status).toBe("live");
    const before = room.view().day;
    room.step();
    expect(room.view().day).toBe(before + 1);
  });

  it("ends the room at the close of the season", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 7);
    room.start();
    for (let i = 0; i < 40; i++) room.step(); // past the 28-day season
    expect(room.status).toBe("ended");
    // A finished room can't be joined.
    expect(rm.join(room.code, "late", "Nell")).toBeUndefined();
  });

  it("reassigns the host when the host leaves, and drops an empty room", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    rm.join(room.code, "p2", "Tom");
    rm.leaveAll("host1");
    expect(room.hostId).toBe("p2");
    expect(room.state().players.find((p) => p.id === "p2")?.isHost).toBe(true);
    rm.leaveAll("p2");
    expect(rm.get(room.id)).toBeUndefined();
    expect(rm.size).toBe(0);
  });

  it("lets a joiner claim an open shop, and keeps the bakery for the host", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    rm.join(room.code, "p2", "Tom");
    // The host already runs the bakery; a joiner can't take it.
    expect(room.claim("p2", "bakery")).toBe(false);
    // But they can claim the weaver.
    expect(room.claim("p2", "weaver")).toBe(true);
    const slot = room.state().slots.find((s) => s.type === "weaver");
    expect(slot?.claimed).toBe(true);
    expect(room.state().players.find((p) => p.id === "p2")?.workshopType).toBe("weaver");
    // A third player can't take the weaver now; another shop is still free.
    rm.join(room.code, "p3", "Mara");
    expect(room.claim("p3", "weaver")).toBe(false);
    expect(room.claim("p3", "smithy")).toBe(true);
  });

  it("routes each player's action to their own shop (independent coins)", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    rm.join(room.code, "p2", "Tom");
    room.claim("p2", "weaver");
    const hostWs = room.workshopOf("host1")!;
    const weaverWs = room.workshopOf("p2")!;
    expect(hostWs).not.toBe(weaverWs);
    room.session.setPrice(2, hostWs);
    room.session.setPrice(5, weaverWs);
    room.start();
    for (let i = 0; i < 5; i++) room.step();
    expect(room.viewFor(hostWs).workshopType).toBe("bakery");
    expect(room.viewFor(weaverWs).workshopType).toBe("weaver");
    expect(room.viewFor(hostWs).price).toBe(2);
    expect(room.viewFor(weaverWs).price).toBe(5);
  });

  it("frees a claimed shop back to the AI when its player leaves", () => {
    const rm = new RoomManager();
    const room = rm.create("host1", "Ada", 42);
    rm.join(room.code, "p2", "Tom");
    room.claim("p2", "smithy");
    expect(room.state().slots.find((s) => s.type === "smithy")?.claimed).toBe(true);
    rm.leaveAll("p2");
    expect(room.state().slots.find((s) => s.type === "smithy")?.claimed).toBe(false);
  });

  it("two rooms run independent seasons", () => {
    const rm = new RoomManager();
    const a = rm.create("h1", "A", 1);
    const b = rm.create("h2", "B", 2);
    a.start();
    a.step();
    a.step();
    b.start();
    b.step();
    expect(a.view().day).toBe(3);
    expect(b.view().day).toBe(2);
  });
});
