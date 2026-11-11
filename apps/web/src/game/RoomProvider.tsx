import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { SoloView, WorkshopSlot } from "@millbrook/economy";

export type WorkshopType = WorkshopSlot["type"];

/**
 * The client side of the rooms server. Connects to the game server over
 * Socket.IO on demand (only when you host or join — solo play never opens a
 * socket), mirrors the room's lobby state and live view into React, and sends
 * the host's actions back. See apps/server/src/protocol.ts for the contract.
 */

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:8080";

export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  /** The shop this player runs, once claimed (the host gets the bakery). */
  workshopType?: WorkshopType;
}

export interface RoomState {
  id: string;
  code: string;
  status: "lobby" | "live" | "ended";
  hostId: string;
  players: RoomPlayer[];
  /** The four shops and whether a human runs each — for the lobby claim grid. */
  slots: WorkshopSlot[];
  seed: number;
  day: number;
  totalDays: number;
}

export type GameAction =
  | { type: "setPrice"; value: number }
  | { type: "setWage"; value: number }
  | { type: "hire" };

export interface RoomController {
  status: "idle" | "connecting" | "connected";
  room: RoomState | null;
  view: SoloView | null;
  error: string | null;
  myId: string | null;
  isHost: boolean;
  /** The shop I run this room, if I've claimed one (host always runs the bakery). */
  myWorkshop: WorkshopType | null;
  createRoom: (name: string, seed?: number) => void;
  joinRoom: (code: string, name: string) => void;
  claimWorkshop: (type: WorkshopType) => void;
  leaveRoom: () => void;
  startRoom: () => void;
  play: () => void;
  pause: () => void;
  setPrice: (n: number) => void;
  setWage: (n: number) => void;
  hire: () => void;
}

const RoomContext = createContext<RoomController | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<RoomController["status"]>("idle");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<SoloView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const ensureSocket = useCallback((): Socket => {
    if (socketRef.current) return socketRef.current;
    setStatus("connecting");
    const socket = io(SERVER_URL, { transports: ["websocket"], forceNew: true });
    socket.on("connect", () => {
      setMyId(socket.id ?? null);
      setStatus("connected");
    });
    socket.on("disconnect", () => setStatus("idle"));
    socket.on("connect_error", () => setError(`Can't reach the game server at ${SERVER_URL}.`));
    socket.on("room:state", (state: RoomState) => setRoom(state));
    socket.on("game:view", (v: SoloView) => setView(v));
    socket.on("error", (payload: { message: string }) => setError(payload.message));
    socketRef.current = socket;
    return socket;
  }, []);

  const createRoom = useCallback(
    (name: string, seed?: number) => {
      setError(null);
      ensureSocket().emit("room:create", { name, seed });
    },
    [ensureSocket],
  );

  const joinRoom = useCallback(
    (code: string, name: string) => {
      setError(null);
      ensureSocket().emit("room:join", { code: code.trim().toUpperCase(), name });
    },
    [ensureSocket],
  );

  const leaveRoom = useCallback(() => {
    socketRef.current?.emit("room:leave");
    socketRef.current?.disconnect();
    socketRef.current = null;
    setRoom(null);
    setView(null);
    setStatus("idle");
  }, []);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const me = room && myId ? room.players.find((p) => p.id === myId) : undefined;

  const value: RoomController = {
    status,
    room,
    view,
    error,
    myId,
    isHost: !!room && !!myId && room.hostId === myId,
    myWorkshop: me?.workshopType ?? null,
    createRoom,
    joinRoom,
    claimWorkshop: (type) => emit("room:claim", { type }),
    leaveRoom,
    startRoom: () => emit("room:start"),
    play: () => emit("game:play"),
    pause: () => emit("game:pause"),
    setPrice: (n) => emit("game:action", { type: "setPrice", value: n } satisfies GameAction),
    setWage: (n) => emit("game:action", { type: "setWage", value: n } satisfies GameAction),
    hire: () => emit("game:action", { type: "hire" } satisfies GameAction),
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomController {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within a RoomProvider");
  return ctx;
}
