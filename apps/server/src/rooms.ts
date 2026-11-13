/**
 * Rooms: a town a few people share. Each room owns one deterministic season
 * (the same `@millbrook/economy` engine the solo game uses) plus its players
 * and lifecycle. The model here is pure in-memory state and has no socket or
 * database dependency, so it is unit-tested directly; `index.ts` wires it to
 * Socket.IO and (later) Postgres.
 *
 * Multiplayer note: today the host runs the one player workshop and the rest
 * join to watch the same live town; claiming a workshop each is the next step.
 * The README keeps multiplayer play under Roadmap until it lands.
 */

import { randomUUID } from "node:crypto";
import {
  createSoloSession,
  rules,
  type SoloSession,
  type SoloView,
  type WorkshopSlot,
  type StandingRow,
  type GmEventCard,
} from "@millbrook/economy";
import type { WorkshopType } from "@millbrook/shared";
import {
  CHAT_MAX_LEN,
  type ChatMessage,
  type TradeOffer,
  type TownSnapshot,
  type RoomSpeed,
  type MorningReport,
} from "./protocol.js";

/** Cap the walking figures sent to the 3D scene (matches the client). */
const SNAPSHOT_FIGURES = 18;

/** Keep the chat bounded so a long-lived room doesn't grow without end. */
const CHAT_HISTORY = 100;

/** Trim, cap length and strip control characters from a chat line (baseline moderation). */
function cleanChatText(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, CHAT_MAX_LEN);
}

export type RoomStatus = "lobby" | "live" | "ended";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  /** The shop this player runs, once claimed (the host gets the bakery). */
  workshopId?: string;
  workshopType?: WorkshopType;
}

export interface RoomState {
  id: string;
  code: string;
  status: RoomStatus;
  hostId: string;
  players: Player[];
  /** The four shops and whether a human runs each — for the lobby claim grid. */
  slots: WorkshopSlot[];
  seed: number;
  day: number;
  totalDays: number;
  /** Live owner standings (ranked) — a leaderboard during play and the final
   *  scoreboard once the season ends. */
  standings: StandingRow[];
  /** The latest Game Master event, for the "Why did this happen?" card. */
  gm: GmEventCard | null;
  /** How the room advances its days. */
  speed: RoomSpeed;
  /** League: wall-clock ms when the next day advances, or null (live / not running). */
  nextTickAt: number | null;
  /** League: how many present humans have pressed Ready, and how many there are. */
  readyCount: number;
  humanCount: number;
  /** Which season this room is on (rolls over at day 28). */
  seasonNumber: number;
}

/** One deterministic season mutation, replayed to restore a room's state. */
export type Op =
  | { t: "claim"; type: WorkshopType }
  | { t: "release"; ws: string }
  | { t: "price"; ws: string; v: number }
  | { t: "wage"; ws: string; v: number }
  | { t: "hire"; ws: string }
  | { t: "decide"; id: string; opt: string }
  | { t: "trade"; from: string; to: string; qty: number; coins: number }
  | { t: "step" };

/** A room's full state as plain data — persisted and replayed on restart. */
export interface RoomSnapshot {
  id: string;
  code: string;
  seed: number;
  speed: RoomSpeed;
  tickEveryMs: number;
  status: RoomStatus;
  hostId: string;
  seasonNumber: number;
  players: Player[];
  chat: ChatMessage[];
  ops: Op[];
  nextTickAt: number | null;
}

/** Unambiguous invite codes: no 0/O/1/I. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export class Room {
  readonly id: string;
  readonly code: string;
  readonly seed: number;
  readonly session: SoloSession;
  status: RoomStatus = "lobby";
  hostId: string;
  private readonly players = new Map<string, Player>();
  private readonly chatLog: ChatMessage[] = [];
  private readonly offers = new Map<string, TradeOffer>();
  /** How many Game Master events have been posted to chat so far. */
  private gmSeen = 0;

  // ── League ──────────────────────────────────────────────────────────────────
  readonly speed: RoomSpeed;
  /** League cadence: real ms between automatic day advances. */
  readonly tickEveryMs: number;
  /** Wall-clock ms of the next scheduled advance (league only), or null. */
  nextTickAt: number | null = null;
  seasonNumber = 1;
  private readonly ready = new Set<string>();
  /** The last game day each player saw, for the morning report. */
  private readonly lastSeen = new Map<string, number>();

  // ── Persistence: the ordered log of deterministic season mutations ──────────
  private readonly ops: Op[] = [];

  constructor(
    id: string,
    code: string,
    hostId: string,
    hostName: string,
    seed: number,
    opts: { speed?: RoomSpeed; tickEveryMs?: number } = {},
  ) {
    this.id = id;
    this.code = code;
    this.seed = seed;
    this.hostId = hostId;
    this.speed = opts.speed ?? "live";
    this.tickEveryMs = opts.tickEveryMs ?? 6 * 60 * 60 * 1000; // 6h default for League
    this.session = createSoloSession(seed);
    // The host runs the bakery (the session's pre-claimed player shop).
    this.players.set(hostId, {
      id: hostId,
      name: hostName,
      isHost: true,
      workshopId: this.session.playerWorkshopId,
      workshopType: "bakery",
    });
  }

  private logOp(op: Op): void {
    this.ops.push(op);
  }

  // ── Season mutations (logged so a room can be replayed from its seed) ────────

  setPrice(value: number, workshopId?: string): void {
    const ws = workshopId ?? this.session.playerWorkshopId;
    this.session.setPrice(value, ws);
    this.logOp({ t: "price", ws, v: this.session.view(ws).price });
  }

  setWage(value: number, workshopId?: string): void {
    const ws = workshopId ?? this.session.playerWorkshopId;
    this.session.setWage(value, ws);
    this.logOp({ t: "wage", ws, v: this.session.view(ws).wage });
  }

  hire(workshopId?: string): void {
    const ws = workshopId ?? this.session.playerWorkshopId;
    this.session.hire(ws);
    this.logOp({ t: "hire", ws });
  }

  decide(decisionId: string, optionId: string): void {
    this.session.decide(decisionId, optionId);
    this.logOp({ t: "decide", id: decisionId, opt: optionId });
  }

  addPlayer(id: string, name: string): Player {
    const existing = this.players.get(id);
    if (existing) return existing;
    const player: Player = { id, name, isHost: false };
    this.players.set(id, player);
    return player;
  }

  /** A player claims an open shop to run. Returns true if the claim took. The
   *  bakery belongs to the host, so it can't be claimed by anyone else. */
  claim(playerId: string, type: WorkshopType): boolean {
    const player = this.players.get(playerId);
    if (!player || this.status !== "lobby") return false;
    // Drop any shop they held first (but never the host's bakery).
    if (player.workshopId && player.workshopId !== this.session.playerWorkshopId) {
      this.session.release(player.workshopId);
      this.logOp({ t: "release", ws: player.workshopId });
      player.workshopId = undefined;
      player.workshopType = undefined;
    }
    const id = this.session.claim(type);
    if (!id) return false;
    this.logOp({ t: "claim", type });
    player.workshopId = id;
    player.workshopType = type;
    return true;
  }

  /** The shop a player runs, if any. */
  workshopOf(playerId: string): string | undefined {
    return this.players.get(playerId)?.workshopId;
  }

  removePlayer(id: string): void {
    const leaving = this.players.get(id);
    const wasHost = leaving?.isHost;
    // Hand their shop back to the AI (never the bakery; that passes to the next host).
    if (leaving?.workshopId && leaving.workshopId !== this.session.playerWorkshopId) {
      this.session.release(leaving.workshopId);
      this.logOp({ t: "release", ws: leaving.workshopId });
    }
    this.dropOffersInvolving(id);
    this.players.delete(id);
    // If the host leaves, hand the room — and the bakery — to the next player.
    if (wasHost) {
      const next = this.players.values().next().value as Player | undefined;
      if (next) {
        next.isHost = true;
        this.hostId = next.id;
        if (next.workshopId && next.workshopId !== this.session.playerWorkshopId) {
          this.session.release(next.workshopId);
          this.logOp({ t: "release", ws: next.workshopId });
        }
        next.workshopId = this.session.playerWorkshopId;
        next.workshopType = "bakery";
      }
    }
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  get playerCount(): number {
    return this.players.size;
  }

  get playerList(): Player[] {
    return [...this.players.values()];
  }

  nameOf(playerId: string): string | undefined {
    return this.players.get(playerId)?.name;
  }

  /** Advance one game day while live; mark ended at the season's close. */
  step(): void {
    if (this.status !== "live") return;
    this.session.step();
    this.logOp({ t: "step" });
    this.ready.clear(); // a new day: everyone must opt to skip again
    if (this.session.view().ended) this.status = "ended";
  }

  view(): SoloView {
    return this.session.view();
  }

  /** The live view of one shop — a player's own, or the bakery for a spectator. */
  viewFor(workshopId?: string): SoloView {
    return this.session.view(workshopId);
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  private currentDay(): number {
    return this.session.view().day;
  }

  private record(msg: ChatMessage): ChatMessage {
    this.chatLog.push(msg);
    if (this.chatLog.length > CHAT_HISTORY) this.chatLog.splice(0, this.chatLog.length - CHAT_HISTORY);
    return msg;
  }

  /** A person's chat line. Returns null if the sender isn't here or it's empty. */
  postChat(playerId: string, text: string): ChatMessage | null {
    const player = this.players.get(playerId);
    if (!player) return null;
    const clean = cleanChatText(text);
    if (!clean) return null;
    return this.record({
      id: randomUUID(),
      playerId,
      name: player.name,
      text: clean,
      day: this.currentDay(),
      ts: Date.now(),
    });
  }

  /** A system notice (someone joined, claimed a shop, left…). */
  note(text: string): ChatMessage {
    return this.record({
      id: randomUUID(),
      playerId: "system",
      name: "Millbrook",
      text,
      day: this.currentDay(),
      ts: Date.now(),
      system: true,
    });
  }

  chatHistory(): ChatMessage[] {
    return [...this.chatLog];
  }

  // ── Trade offers ─────────────────────────────────────────────────────────────

  openOffers(): TradeOffer[] {
    return [...this.offers.values()];
  }

  /** A shop-running player posts an offer to sell its output good for coins.
   *  Validated for shape here; stock and funds are checked when it's accepted. */
  makeOffer(
    fromPlayerId: string,
    spec: { qty: number; coins: number; toPlayerId?: string | null },
  ): { offer?: TradeOffer; error?: string } {
    if (this.status !== "live") return { error: "Trading opens once the season is live." };
    const seller = this.players.get(fromPlayerId);
    if (!seller?.workshopId) return { error: "Claim a shop before you offer a trade." };
    const qty = Math.floor(spec.qty);
    const coins = Math.floor(spec.coins);
    if (!(qty > 0) || !(coins >= 0)) return { error: "An offer needs a whole quantity and price." };
    const good = this.session.tradeGood(seller.workshopId);
    if (!good) return { error: "That shop has nothing to sell." };
    const toPlayerId = spec.toPlayerId ?? null;
    if (toPlayerId && !this.players.has(toPlayerId)) return { error: "That player isn't in the room." };
    if (toPlayerId === fromPlayerId) return { error: "You can't trade with yourself." };
    const offer: TradeOffer = {
      id: randomUUID(),
      fromPlayerId,
      fromName: seller.name,
      fromWorkshopId: seller.workshopId,
      good,
      qty,
      coins,
      toPlayerId,
      ts: Date.now(),
    };
    this.offers.set(offer.id, offer);
    return { offer };
  }

  /** Another shop-running player accepts an offer; runs the trade on the economy. */
  acceptOffer(byPlayerId: string, offerId: string): { ok: boolean; reason: string; offer?: TradeOffer } {
    const offer = this.offers.get(offerId);
    if (!offer) return { ok: false, reason: "That offer is no longer open." };
    if (offer.toPlayerId && offer.toPlayerId !== byPlayerId) {
      return { ok: false, reason: "That offer was made to someone else." };
    }
    const buyer = this.players.get(byPlayerId);
    if (!buyer?.workshopId) return { ok: false, reason: "Claim a shop before you accept a trade." };
    if (buyer.id === offer.fromPlayerId) return { ok: false, reason: "You can't accept your own offer." };
    const res = this.session.trade(offer.fromWorkshopId, buyer.workshopId, offer.qty, offer.coins);
    if (res.ok) {
      this.offers.delete(offerId);
      this.logOp({ t: "trade", from: offer.fromWorkshopId, to: buyer.workshopId, qty: offer.qty, coins: offer.coins });
    }
    return { ...res, offer };
  }

  /** The recipient (or anyone it's open to) turns an offer down, or the seller pulls it. */
  declineOffer(byPlayerId: string, offerId: string): TradeOffer | undefined {
    const offer = this.offers.get(offerId);
    if (!offer) return undefined;
    const mayAct = offer.fromPlayerId === byPlayerId || !offer.toPlayerId || offer.toPlayerId === byPlayerId;
    if (!mayAct) return undefined;
    this.offers.delete(offerId);
    return offer;
  }

  /** Drop any offers from or to a player (they left, or their shop changed). */
  private dropOffersInvolving(playerId: string): void {
    for (const [id, o] of this.offers) {
      if (o.fromPlayerId === playerId || o.toPlayerId === playerId) this.offers.delete(id);
    }
  }

  state(): RoomState {
    const v = this.session.view();
    return {
      id: this.id,
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      players: [...this.players.values()],
      slots: this.session.workshopSlots(),
      seed: this.seed,
      day: v.day,
      totalDays: v.totalDays,
      standings: this.session.standings(),
      gm: this.session.gmEvents(1)[0] ?? null,
      speed: this.speed,
      nextTickAt: this.nextTickAt,
      readyCount: this.readyCount,
      humanCount: this.players.size,
      seasonNumber: this.seasonNumber,
    };
  }

  /** A compact snapshot of the shared town for the 3D diorama. */
  townSnapshot(): TownSnapshot {
    const w = this.session.world;
    const v = this.session.view();
    return {
      workshops: [...w.workshops.values()].map((s) => ({
        id: s.id,
        type: s.type,
        busy: s.soldToday > 0.5,
        bankrupt: s.bankrupt,
      })),
      owners: [...w.owners.values()].map((o) => ({ strategy: o.strategy, workshopId: o.workshopId })),
      residents: rules
        .aliveResidents(w)
        .slice(0, SNAPSHOT_FIGURES)
        .map((r) => ({ id: r.id, employerId: r.employerId, reason: r.lastReason })),
      soldToday: v.soldToday,
      day: v.day,
    };
  }

  /** Game Master events that have fired since the last call — so the server can
   *  post them into the room chat as they happen, once each. `gmEvents` is
   *  latest-first, so the new ones are at the front; return them oldest-first. */
  drainNewGmEvents(): GmEventCard[] {
    const all = this.session.gmEvents(100);
    const newCount = all.length - this.gmSeen;
    this.gmSeen = all.length;
    return newCount > 0 ? all.slice(0, newCount).reverse() : [];
  }

  // ── League: scheduler, ready-to-skip, morning report, season rollover ───────

  /** Host starts the season; a league room also sets its first scheduled tick. */
  start(): boolean {
    if (this.status !== "lobby") return false;
    this.status = "live";
    if (this.speed === "league") this.nextTickAt = Date.now() + this.tickEveryMs;
    return true;
  }

  /** True when the league clock says it's time to advance a day. */
  dueToTick(now = Date.now()): boolean {
    return this.status === "live" && this.speed === "league" && this.nextTickAt !== null && now >= this.nextTickAt;
  }

  /** Reschedule the next league advance after a day has been stepped. */
  scheduleNextTick(now = Date.now()): void {
    this.nextTickAt = this.status === "live" && this.speed === "league" ? now + this.tickEveryMs : null;
  }

  /** A present human opts to skip the wait; true once everyone present is ready. */
  markReady(playerId: string): boolean {
    if (this.status !== "live" || !this.players.has(playerId)) return false;
    this.ready.add(playerId);
    return this.allReady();
  }

  /** All present players have pressed Ready (and there is at least one). */
  allReady(): boolean {
    const present = [...this.players.keys()];
    return present.length > 0 && present.every((id) => this.ready.has(id));
  }

  get readyCount(): number {
    return this.ready.size;
  }

  /** Record the day — and coin position — a player last saw, for the next report.
   *  Uses the engine's 0-indexed `world.day` so it lines up with feed event days. */
  markSeen(playerId: string): void {
    this.lastSeen.set(playerId, this.session.world.day);
    const ws = this.workshopOf(playerId);
    this.lastSeenCoins.set(playerId, ws ? Math.round(this.session.view(ws).coins) : 0);
  }

  /** What a returning player missed since they last saw the room (null if nothing). */
  morningReportFor(playerId: string): MorningReport | null {
    const from = this.lastSeen.get(playerId);
    const to = this.session.world.day;
    if (from === undefined || to <= from) return null;
    const ws = this.workshopOf(playerId);
    // Notable feed events across the days they were away.
    const events = this.session.world.feed
      .filter((e) => e.day >= from && e.day < to)
      .filter((e) =>
        ["gm_event", "election", "bankruptcy", "auction", "strike_start", "death", "birth", "public_works"].includes(e.kind),
      )
      .slice(-6)
      .map((e) => e.text);
    const decisionsResolved = this.session.world.feed.filter(
      (e) => e.day >= from && e.day < to && e.kind === "decision",
    ).length;
    const prevCoins = this.lastSeenCoins.get(playerId) ?? 0;
    const coinsDelta = ws ? Math.round(this.session.view(ws).coins) - prevCoins : 0;
    return { fromDay: from + 1, toDay: to + 1, coinsDelta, events, decisionsResolved };
  }

  private readonly lastSeenCoins = new Map<string, number>();

  /** At day 28 the season closes; open a fresh one so the League continues. */
  rollSeason(): boolean {
    if (this.status !== "ended") return false;
    this.seasonNumber += 1;
    const fresh = createSoloSession(this.seed + this.seasonNumber);
    // Swap in the new season; keep the players and their host/bakery assignment.
    (this as { session: SoloSession }).session = fresh;
    this.ops.length = 0; // a new season starts a new op history (seed + number)
    this.gmSeen = 0;
    this.status = "lobby";
    this.nextTickAt = null;
    for (const p of this.players.values()) {
      p.workshopId = p.isHost ? fresh.playerWorkshopId : undefined;
      p.workshopType = p.isHost ? "bakery" : undefined;
    }
    return true;
  }

  // ── Persistence: snapshot and restore (event-sourced from the seed) ─────────

  snapshot(): RoomSnapshot {
    return {
      id: this.id,
      code: this.code,
      seed: this.seed,
      speed: this.speed,
      tickEveryMs: this.tickEveryMs,
      status: this.status,
      hostId: this.hostId,
      seasonNumber: this.seasonNumber,
      players: [...this.players.values()],
      chat: [...this.chatLog],
      ops: [...this.ops],
      nextTickAt: this.nextTickAt,
    };
  }

  /** Rebuild a room from a snapshot by replaying its ops on a fresh season. */
  static restore(snap: RoomSnapshot): Room {
    const host = snap.players.find((p) => p.isHost) ?? snap.players[0];
    const room = new Room(snap.id, snap.code, host?.id ?? snap.hostId, host?.name ?? "Host", snap.seed, {
      speed: snap.speed,
      tickEveryMs: snap.tickEveryMs,
    });
    room.status = snap.status === "ended" ? "live" : snap.status; // replaying needs live to step
    // Replay every recorded mutation in order (deterministic from the seed).
    for (const op of snap.ops) room.replay(op);
    room.status = snap.status;
    room.hostId = snap.hostId;
    room.seasonNumber = snap.seasonNumber;
    room.nextTickAt = snap.nextTickAt;
    // Restore players (their shop ids match the replayed session) and chat.
    room.players.clear();
    for (const p of snap.players) room.players.set(p.id, { ...p });
    room.chatLog.length = 0;
    room.chatLog.push(...snap.chat);
    room.gmSeen = room.session.gmEvents(1000).length; // don't re-post old GM events
    return room;
  }

  /** Apply one recorded op during a restore. */
  private replay(op: Op): void {
    switch (op.t) {
      case "claim":
        this.session.claim(op.type);
        break;
      case "release":
        this.session.release(op.ws);
        break;
      case "price":
        this.session.setPrice(op.v, op.ws);
        break;
      case "wage":
        this.session.setWage(op.v, op.ws);
        break;
      case "hire":
        this.session.hire(op.ws);
        break;
      case "decide":
        this.session.decide(op.id, op.opt);
        break;
      case "trade":
        this.session.trade(op.from, op.to, op.qty, op.coins);
        break;
      case "step":
        this.session.step();
        break;
    }
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly byCode = new Map<string, string>();

  create(
    hostId: string,
    hostName: string,
    seed = Math.floor(Math.random() * 1_000_000),
    opts: { speed?: RoomSpeed; tickEveryMs?: number } = {},
  ): Room {
    const id = randomUUID();
    let code = makeCode();
    while (this.byCode.has(code)) code = makeCode();
    const room = new Room(id, code, hostId, hostName, seed, opts);
    this.rooms.set(id, room);
    this.byCode.set(code, id);
    return room;
  }

  /** Re-add a persisted room on boot (so a restart loses nothing). */
  adopt(room: Room): void {
    this.rooms.set(room.id, room);
    this.byCode.set(room.code, room.id);
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  getByCode(code: string): Room | undefined {
    const id = this.byCode.get(code.toUpperCase());
    return id ? this.rooms.get(id) : undefined;
  }

  /** Join an existing room by its invite code. Returns the room, or undefined
   *  if the code is unknown or the room has already ended. */
  join(code: string, playerId: string, name: string): Room | undefined {
    const room = this.getByCode(code);
    if (!room || room.status === "ended") return undefined;
    room.addPlayer(playerId, name);
    return room;
  }

  /** Remove a player from whatever room they're in; delete empty rooms. */
  leaveAll(playerId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.hasPlayer(playerId)) {
        room.removePlayer(playerId);
        // A League room keeps running while empty (players drop in across a week);
        // a Live room with nobody left is dropped.
        if (room.playerCount === 0 && room.speed !== "league") {
          this.rooms.delete(room.id);
          this.byCode.delete(room.code);
          return undefined;
        }
        return room;
      }
    }
    return undefined;
  }

  list(): RoomState[] {
    return [...this.rooms.values()].map((r) => r.state());
  }

  /** Every room (for the league scheduler to find those due to advance). */
  all(): Room[] {
    return [...this.rooms.values()];
  }

  get size(): number {
    return this.rooms.size;
  }
}
