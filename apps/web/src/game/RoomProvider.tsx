import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { SoloView, WorkshopSlot, StandingRow, GmEventCard } from "@millbrook/economy";
import { SERVER_URL } from "./serverUrl";
import { useAuth } from "./AuthProvider";

export type WorkshopType = WorkshopSlot["type"];

/** One line of room chat (mirrors apps/server/src/protocol.ts). */
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  day: number;
  ts: number;
  system?: boolean;
}

/** A standing trade offer (mirrors apps/server/src/protocol.ts). */
export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  fromName: string;
  fromWorkshopId: string;
  good: string;
  qty: number;
  coins: number;
  toPlayerId: string | null;
  ts: number;
}

/**
 * The client side of the rooms server. Connects to the game server over
 * Socket.IO on demand (only when you host or join — solo play never opens a
 * socket), mirrors the room's lobby state and live view into React, and sends
 * the host's actions back. See apps/server/src/protocol.ts for the contract.
 */

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
  /** Ranked owner standings — a live leaderboard and the final scoreboard. */
  standings: StandingRow[];
  /** The latest Game Master event, for the "Why did this happen?" card. */
  gm: GmEventCard | null;
  /** How the room advances its days ("live" ticks fast; "league" on a schedule). */
  speed: "live" | "league";
  /** League: wall-clock ms of the next scheduled day, or null. */
  nextTickAt: number | null;
  readyCount: number;
  humanCount: number;
  seasonNumber: number;
  /** How many workshops the room opened (4 classic … 8 with the Carpenter). */
  townSize: 4 | 6 | 7 | 8;
  /** The goal card the room season is scored against. */
  goalCard: string;
}

/** What a returning League player missed (mirrors server MorningReport). */
export interface MorningReport {
  fromDay: number;
  toDay: number;
  coinsDelta: number;
  events: string[];
  decisionsResolved: number;
}

/** Compact shared-town state for the 3D scene (mirrors server TownSnapshot). */
export interface RoomTownSnapshot {
  workshops: { id: string; type: WorkshopType; busy: boolean; bankrupt: boolean }[];
  owners: { strategy: string | null; workshopId: string }[];
  residents: { id: string; employerId: string | null; reason: string }[];
  soldToday: number;
  day: number;
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
  /** The shared town for the 3D scene, or null before the first tick. */
  town: RoomTownSnapshot | null;
  messages: ChatMessage[];
  offers: TradeOffer[];
  /** League: what I missed while away (cleared when dismissed), or null. */
  morningReport: MorningReport | null;
  dismissMorningReport: () => void;
  createRoom: (
    name: string,
    seed?: number,
    speed?: "live" | "league",
    opts?: { goalCard?: string; townSize?: 4 | 6 | 7 | 8 },
  ) => void;
  joinRoom: (code: string, name: string) => void;
  /** League: tell the server I'm ready to skip ahead a day. */
  markReady: () => void;
  claimWorkshop: (type: WorkshopType) => void;
  sendChat: (text: string) => void;
  offerTrade: (spec: { qty: number; coins: number; toPlayerId?: string | null }) => void;
  acceptTrade: (offerId: string) => void;
  declineTrade: (offerId: string) => void;
  leaveRoom: () => void;
  startRoom: () => void;
  play: () => void;
  pause: () => void;
  setPrice: (n: number) => void;
  setWage: (n: number) => void;
  hire: () => void;
  /** Answer a decision card on your shop. */
  decide: (decisionId: string, optionId: string) => void;
}

const RoomContext = createContext<RoomController | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // Track the live session in a ref so the memoised socket factory always reads
  // the current one without being recreated.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<RoomController["status"]>("idle");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [view, setView] = useState<SoloView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [town, setTown] = useState<RoomTownSnapshot | null>(null);
  const [morningReport, setMorningReport] = useState<MorningReport | null>(null);

  const ensureSocket = useCallback((): Socket => {
    if (socketRef.current) return socketRef.current;
    setStatus("connecting");
    // Empty SERVER_URL → connect to the current origin (production behind Caddy).
    // The session id (if signed in) lets the server trust our username.
    const opts = {
      transports: ["websocket"],
      forceNew: true,
      auth: { sessionId: sessionRef.current?.sessionId },
    };
    const socket = SERVER_URL ? io(SERVER_URL, opts) : io(opts);
    socket.on("connect", () => {
      setMyId(socket.id ?? null);
      setStatus("connected");
    });
    socket.on("disconnect", () => setStatus("idle"));
    socket.on("connect_error", () =>
      setError(
        "Can't reach the game server — multiplayer rooms need it running. The solo game works on its own; see the README to host a room.",
      ),
    );
    socket.on("room:state", (state: RoomState) => setRoom(state));
    socket.on("game:view", (v: SoloView) => setView(v));
    socket.on("game:town", (t: RoomTownSnapshot) => setTown(t));
    socket.on("chat:history", (msgs: ChatMessage[]) => setMessages(msgs));
    socket.on("chat:message", (msg: ChatMessage) => setMessages((prev) => [...prev, msg]));
    socket.on("trade:offers", (list: TradeOffer[]) => setOffers(list));
    socket.on("morning:report", (r: MorningReport) => setMorningReport(r));
    socket.on("error", (payload: { message: string }) => setError(payload.message));
    socketRef.current = socket;
    return socket;
  }, []);

  const createRoom = useCallback(
    (
      name: string,
      seed?: number,
      speed: "live" | "league" = "live",
      opts?: { goalCard?: string; townSize?: 4 | 6 | 7 | 8 },
    ) => {
      setError(null);
      // For a league demo, a short tick (2 min) so judges see the schedule move.
      const tickEveryMs = speed === "league" ? 2 * 60 * 1000 : undefined;
      ensureSocket().emit("room:create", {
        name,
        seed,
        speed,
        tickEveryMs,
        goalCard: opts?.goalCard,
        townSize: opts?.townSize,
      });
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
    setTown(null);
    setMessages([]);
    setOffers([]);
    setMorningReport(null);
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
    town,
    messages,
    offers,
    morningReport,
    dismissMorningReport: () => setMorningReport(null),
    createRoom,
    joinRoom,
    markReady: () => emit("room:ready"),
    claimWorkshop: (type) => emit("room:claim", { type }),
    sendChat: (text) => {
      const t = text.trim();
      if (t) emit("chat:send", { text: t });
    },
    offerTrade: (spec) => emit("trade:offer", spec),
    acceptTrade: (offerId) => emit("trade:accept", { offerId }),
    declineTrade: (offerId) => emit("trade:decline", { offerId }),
    leaveRoom,
    startRoom: () => emit("room:start"),
    play: () => emit("game:play"),
    pause: () => emit("game:pause"),
    setPrice: (n) => emit("game:action", { type: "setPrice", value: n } satisfies GameAction),
    setWage: (n) => emit("game:action", { type: "setWage", value: n } satisfies GameAction),
    hire: () => emit("game:action", { type: "hire" } satisfies GameAction),
    decide: (decisionId, optionId) => emit("game:decide", { decisionId, optionId }),
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomController {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within a RoomProvider");
  return ctx;
}
