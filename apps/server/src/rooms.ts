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
import { createSoloSession, type SoloSession, type SoloView, type WorkshopSlot } from "@millbrook/economy";
import type { WorkshopType } from "@millbrook/shared";
import { CHAT_MAX_LEN, type ChatMessage, type TradeOffer } from "./protocol.js";

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

  constructor(id: string, code: string, hostId: string, hostName: string, seed: number) {
    this.id = id;
    this.code = code;
    this.seed = seed;
    this.hostId = hostId;
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
      player.workshopId = undefined;
      player.workshopType = undefined;
    }
    const id = this.session.claim(type);
    if (!id) return false;
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

  /** Host starts the season. */
  start(): boolean {
    if (this.status !== "lobby") return false;
    this.status = "live";
    return true;
  }

  /** Advance one game day while live; mark ended at the season's close. */
  step(): void {
    if (this.status !== "live") return;
    this.session.step();
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
    if (res.ok) this.offers.delete(offerId);
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
    };
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly byCode = new Map<string, string>();

  create(hostId: string, hostName: string, seed = Math.floor(Math.random() * 1_000_000)): Room {
    const id = randomUUID();
    let code = makeCode();
    while (this.byCode.has(code)) code = makeCode();
    const room = new Room(id, code, hostId, hostName, seed);
    this.rooms.set(id, room);
    this.byCode.set(code, id);
    return room;
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
        if (room.playerCount === 0) {
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

  get size(): number {
    return this.rooms.size;
  }
}
