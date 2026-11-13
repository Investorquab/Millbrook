import { describe, expect, it } from "vitest";
import { TOTAL_COINS } from "@millbrook/shared";
import { Room, RoomManager } from "./rooms.js";
import { MemoryRoomStore } from "./persistence.js";

/** Play a room through a scripted season with a couple of actions. */
function playScripted(room: Room): void {
  room.start();
  room.setPrice(3);
  room.step();
  room.setWage(9);
  room.hire();
  room.step();
  room.step();
}

describe("event-sourced snapshot + restore", () => {
  it("replays to a byte-identical world (day, coins, standings)", () => {
    const a = new Room("id", "CODE12", "host", "Host", 42);
    playScripted(a);
    const snap = a.snapshot();

    const b = Room.restore(snap);
    expect(b.view().day).toBe(a.view().day);
    expect(b.view().coins).toBe(a.view().coins);
    expect(b.state().standings.map((r) => [r.name, r.score])).toEqual(
      a.state().standings.map((r) => [r.name, r.score]),
    );
    // The restored season holds the invariant.
    b.session.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("the restored room steps on to stay identical to the original", () => {
    const a = new Room("id", "CODE12", "host", "Host", 7);
    a.start();
    a.setPrice(4);
    a.step();
    const b = Room.restore(a.snapshot());
    // Make the restored one "live" (restore keeps the original status).
    for (let i = 0; i < 5; i++) {
      a.step();
      b.step();
      expect(b.view().coins).toBe(a.view().coins);
      expect(b.view().day).toBe(a.view().day);
    }
  });

  it("carries players, chat and league settings across a restore", () => {
    const a = new Room("id", "CODE12", "host", "Host", 1, { speed: "league", tickEveryMs: 1000 });
    a.addPlayer("p2", "Bo");
    a.claim("p2", "weaver");
    a.start();
    a.postChat("p2", "hello town");
    const b = Room.restore(a.snapshot());
    expect(b.speed).toBe("league");
    expect(b.tickEveryMs).toBe(1000);
    expect(b.playerList.map((p) => p.name).sort()).toEqual(["Bo", "Host"]);
    expect(b.workshopOf("p2")).toBe(a.workshopOf("p2"));
    expect(b.chatHistory().some((m) => m.text === "hello town")).toBe(true);
  });
});

describe("MemoryRoomStore", () => {
  it("saves, loads and removes snapshots", async () => {
    const store = new MemoryRoomStore();
    await store.init();
    const room = new Room("id", "CODE12", "host", "Host", 42, { speed: "league" });
    room.start();
    room.step();
    await store.save(room.snapshot());
    const all = await store.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.ops.filter((o) => o.t === "step")).toHaveLength(1);
    await store.remove("id");
    expect(await store.loadAll()).toHaveLength(0);
  });
});

describe("League mechanics", () => {
  it("schedules the next day on start and reports when it's due", () => {
    const room = new Room("id", "CODE12", "host", "Host", 42, { speed: "league", tickEveryMs: 1000 });
    room.start();
    expect(room.nextTickAt).not.toBeNull();
    expect(room.dueToTick(room.nextTickAt! - 1)).toBe(false);
    expect(room.dueToTick(room.nextTickAt! + 1)).toBe(true);
    room.step();
    room.scheduleNextTick(10_000);
    expect(room.nextTickAt).toBe(11_000);
  });

  it("advances when every present player is ready", () => {
    const room = new Room("id", "CODE12", "host", "Host", 42, { speed: "league" });
    room.addPlayer("p2", "Bo");
    room.start();
    expect(room.markReady("host")).toBe(false); // not everyone yet
    expect(room.allReady()).toBe(false);
    expect(room.markReady("p2")).toBe(true); // now all present are ready
    room.step(); // stepping clears the ready set for the next day
    expect(room.readyCount).toBe(0);
  });

  it("writes a morning report of what a player missed", () => {
    const room = new Room("id", "CODE12", "host", "Host", 42, { speed: "league" });
    room.start();
    room.markSeen("host");
    for (let i = 0; i < 5; i++) room.step();
    const report = room.morningReportFor("host");
    expect(report).not.toBeNull();
    expect(report!.fromDay).toBe(1);
    expect(report!.toDay).toBe(6);
    expect(typeof report!.coinsDelta).toBe("number");
  });

  it("rolls into a fresh season at the season's close", () => {
    const room = new Room("id", "CODE12", "host", "Host", 42, { speed: "league" });
    room.start();
    for (let i = 0; i < 28; i++) room.step();
    expect(room.view().ended).toBe(true);
    expect(room.rollSeason()).toBe(true);
    expect(room.seasonNumber).toBe(2);
    expect(room.state().status).toBe("lobby");
    room.session.world.ledger.assertInvariant(TOTAL_COINS);
  });

  it("keeps a League room alive when it empties (players drop in across a week)", () => {
    const mgr = new RoomManager();
    const room = mgr.create("host", "Host", 42, { speed: "league" });
    mgr.leaveAll("host"); // host left…
    expect(room.playerCount).toBe(0);
    expect(mgr.get(room.id)).toBeDefined(); // …but the league room persists

    const live = new RoomManager();
    const liveRoom = live.create("h2", "Host", 42); // a plain Live room
    live.leaveAll("h2");
    expect(live.get(liveRoom.id)).toBeUndefined(); // …is dropped when empty
  });
});
