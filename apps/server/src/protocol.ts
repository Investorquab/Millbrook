/**
 * The Socket.IO protocol between the web client and the game server. Kept in one
 * place so the client and server agree on event names and payloads.
 */

import type { SoloView } from "@millbrook/economy";
import type { WorkshopType } from "@millbrook/shared";
import type { RoomState } from "./rooms.js";

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
  "game:play": () => void;
  "game:pause": () => void;
  "game:action": (payload: GameAction) => void;
}

/** Server → client events. */
export interface ServerToClient {
  "room:state": (state: RoomState) => void;
  "game:view": (view: SoloView) => void;
  "chat:message": (message: ChatMessage) => void;
  /** The recent backlog, sent to a client as it joins. */
  "chat:history": (messages: ChatMessage[]) => void;
  "error": (payload: { message: string }) => void;
}

export type GameAction =
  | { type: "setPrice"; value: number }
  | { type: "setWage"; value: number }
  | { type: "hire" };

/** How long a game day takes while a room is live (ms). Matches the web solo. */
export const ROOM_DAY_MS = 1200;
