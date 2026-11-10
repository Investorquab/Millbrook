/**
 * The Socket.IO protocol between the web client and the game server. Kept in one
 * place so the client and server agree on event names and payloads.
 */

import type { SoloView } from "@millbrook/economy";
import type { RoomState } from "./rooms.js";

/** Client → server events. */
export interface ClientToServer {
  "room:create": (payload: { name: string; seed?: number }) => void;
  "room:join": (payload: { code: string; name: string }) => void;
  "room:leave": () => void;
  "room:start": () => void;
  "game:play": () => void;
  "game:pause": () => void;
  "game:action": (payload: GameAction) => void;
}

/** Server → client events. */
export interface ServerToClient {
  "room:state": (state: RoomState) => void;
  "game:view": (view: SoloView) => void;
  "error": (payload: { message: string }) => void;
}

export type GameAction =
  | { type: "setPrice"; value: number }
  | { type: "setWage"; value: number }
  | { type: "hire" };

/** How long a game day takes while a room is live (ms). Matches the web solo. */
export const ROOM_DAY_MS = 1200;
