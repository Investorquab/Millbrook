/**
 * The Socket.IO protocol between the web client and the game server. Kept in one
 * place so the client and server agree on event names and payloads.
 */

import type { SoloView } from "@millbrook/economy";
import type { Good, WorkshopType } from "@millbrook/shared";
import type { RoomState } from "./rooms.js";

/** A standing trade offer: a seller will give `qty` of their output good for
 *  `coins`, to one player or to anyone in the room. Accept or let it lapse. */
export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  fromName: string;
  fromWorkshopId: string;
  good: Good;
  qty: number;
  coins: number;
  /** A targeted offer names its recipient; null means open to the room. */
  toPlayerId: string | null;
  ts: number;
}

/** One line of room chat. The server stamps id, author, day and timestamp. */
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  /** The game day the line was posted on (1-indexed). */
  day: number;
  /** Server wall-clock ms, for ordering and display. */
  ts: number;
  /** True for server notices (joins, claims) rather than a person's message. */
  system?: boolean;
}

/** Longest chat line the server will accept; longer is trimmed. */
export const CHAT_MAX_LEN = 240;

/** Client → server events. */
export interface ClientToServer {
  "room:create": (payload: { name: string; seed?: number }) => void;
  "room:join": (payload: { code: string; name: string }) => void;
  "room:claim": (payload: { type: WorkshopType }) => void;
  "room:leave": () => void;
  "room:start": () => void;
  "chat:send": (payload: { text: string }) => void;
  "trade:offer": (payload: { qty: number; coins: number; toPlayerId?: string | null }) => void;
  "trade:accept": (payload: { offerId: string }) => void;
  "trade:decline": (payload: { offerId: string }) => void;
  "game:play": () => void;
  "game:pause": () => void;
  "game:action": (payload: GameAction) => void;
  "game:decide": (payload: { decisionId: string; optionId: string }) => void;
}

/** Just enough town state for the 3D diorama to render a room's shared town. */
export interface TownSnapshot {
  workshops: { id: string; type: WorkshopType; busy: boolean; bankrupt: boolean }[];
  owners: { strategy: string | null; workshopId: string }[];
  residents: { id: string; employerId: string | null; reason: string }[];
  soldToday: number;
  day: number;
}

/** Server → client events. */
export interface ServerToClient {
  "room:state": (state: RoomState) => void;
  "game:view": (view: SoloView) => void;
  /** The shared town for the 3D scene, sent each tick while a room is live. */
  "game:town": (snapshot: TownSnapshot) => void;
  "chat:message": (message: ChatMessage) => void;
  /** The recent backlog, sent to a client as it joins. */
  "chat:history": (messages: ChatMessage[]) => void;
  /** The room's current open trade offers. */
  "trade:offers": (offers: TradeOffer[]) => void;
  "error": (payload: { message: string }) => void;
}

export type GameAction =
  | { type: "setPrice"; value: number }
  | { type: "setWage"; value: number }
  | { type: "hire" };

/** How long a game day takes while a room is live (ms). Matches the web solo. */
export const ROOM_DAY_MS = 1200;
