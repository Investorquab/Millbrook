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
import { createSoloSession, type SoloSession, type SoloView } from "@millbrook/economy";

export type RoomStatus = "lobby" | "live" | "ended";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

export interface RoomState {
  id: string;
  code: string;
  status: RoomStatus;
  hostId: string;
  players: Player[];
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

  constructor(id: string, code: string, hostId: string, hostName: string, seed: number) {
    this.id = id;
    this.code = code;
    this.seed = seed;
    this.hostId = hostId;
    this.session = createSoloSession(seed);
    this.players.set(hostId, { id: hostId, name: hostName, isHost: true });
  }

  addPlayer(id: string, name: string): Player {
    const existing = this.players.get(id);
    if (existing) return existing;
    const player: Player = { id, name, isHost: false };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id: string): void {
    const wasHost = this.players.get(id)?.isHost;
    this.players.delete(id);
    // If the host leaves, hand the room to the next player so it isn't orphaned.
    if (wasHost) {
      const next = this.players.values().next().value as Player | undefined;
      if (next) {
        next.isHost = true;
        this.hostId = next.id;
      }
    }
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  get playerCount(): number {
    return this.players.size;
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

  state(): RoomState {
    const v = this.session.view();
    return {
      id: this.id,
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      players: [...this.players.values()],
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
