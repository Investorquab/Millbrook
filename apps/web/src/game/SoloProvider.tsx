import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SoloSession, type SoloView } from "@millbrook/economy";

/** How long a game day takes while the town is "playing" (ms). */
const DAY_MS = 1200;

/** How many workshops the town opens. The classic town is four; the full town
 *  adds the Tailor (buys cloth from the Weaver) and the Tavern (buys bread from
 *  the Bakery). Owners are ordered so the supply-chain shops get able owners. */
export type TownSize = 4 | 6;
const TOWN_WORKSHOPS: Record<TownSize, string[]> = {
  4: ["bakery", "weaver", "smithy", "brewery"],
  6: ["bakery", "smithy", "weaver", "tailor", "tavern", "brewery"],
};

function makeSession(seed: number, size: TownSize): SoloSession {
  return new SoloSession({ seed, days: 28, openWorkshops: TOWN_WORKSHOPS[size] as never });
}

export interface SoloController {
  /** The live view, refreshed on every change. */
  view: SoloView;
  /** The underlying session, for screens that read the world directly
   *  (residents, ledger holdings, metrics, standings). */
  session: SoloSession;
  running: boolean;
  play: () => void;
  pause: () => void;
  stepOnce: () => void;
  setPrice: (n: number) => void;
  setWage: (n: number) => void;
  hire: () => void;
  /** Bid on a failed rival's premises at auction (takes it over), or pass. */
  takeOverAuction: (workshopId: string) => void;
  passAuction: (workshopId: string) => void;
  /** How many workshops the current town has (4 classic, 6 full town). */
  townSize: TownSize;
  /** Start a fresh season with a chosen town size (resets the season). */
  setTownSize: (size: TownSize) => void;
  /** Start a fresh season (optionally with a new seed). */
  newSeason: (seed?: number) => void;
}

const SoloContext = createContext<SoloController | null>(null);

/**
 * Holds one {@link SoloSession} for the whole app so every screen — the town,
 * the resident card, Proof, the season review — reads the same live season.
 * The session is the pure, deterministic engine; this provider mirrors its view
 * into React state and advances the clock while "playing".
 */
export function SoloProvider({ children, seed = 42 }: { children: ReactNode; seed?: number }) {
  const ref = useRef<SoloSession | null>(null);
  if (ref.current === null) ref.current = makeSession(seed, 4);

  const [view, setView] = useState<SoloView>(() => ref.current!.view());
  const [running, setRunning] = useState(false);
  const [townSize, setTownSizeState] = useState<TownSize>(4);

  const refresh = useCallback(() => setView(ref.current!.view()), []);

  const stepOnce = useCallback(() => {
    ref.current!.step();
    refresh();
  }, [refresh]);

  const setPrice = useCallback(
    (n: number) => {
      ref.current!.setPrice(n);
      refresh();
    },
    [refresh],
  );

  const setWage = useCallback(
    (n: number) => {
      ref.current!.setWage(n);
      refresh();
    },
    [refresh],
  );

  const hire = useCallback(() => {
    ref.current!.hire();
    refresh();
  }, [refresh]);

  const takeOverAuction = useCallback(
    (workshopId: string) => {
      ref.current!.takeOverAtAuction(workshopId);
      refresh();
    },
    [refresh],
  );

  const passAuction = useCallback(
    (workshopId: string) => {
      ref.current!.passAtAuction(workshopId);
      refresh();
    },
    [refresh],
  );

  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);

  const newSeason = useCallback(
    (nextSeed = seed) => {
      ref.current = makeSession(nextSeed, townSize);
      setRunning(false);
      refresh();
    },
    [refresh, seed, townSize],
  );

  const setTownSize = useCallback(
    (size: TownSize) => {
      ref.current = makeSession(seed, size);
      setTownSizeState(size);
      setRunning(false);
      refresh();
    },
    [refresh, seed],
  );

  // Advance a day on a timer while running; stop at the end of the season.
  useEffect(() => {
    if (!running) return;
    if (ref.current!.view().ended) {
      setRunning(false);
      return;
    }
    const id = setInterval(() => {
      ref.current!.step();
      refresh();
      if (ref.current!.view().ended) setRunning(false);
    }, DAY_MS);
    return () => clearInterval(id);
  }, [running, refresh]);

  const value: SoloController = {
    view,
    session: ref.current,
    running,
    play,
    pause,
    stepOnce,
    setPrice,
    setWage,
    hire,
    takeOverAuction,
    passAuction,
    townSize,
    setTownSize,
    newSeason,
  };

  return <SoloContext.Provider value={value}>{children}</SoloContext.Provider>;
}

/** Read the shared solo season. Must be used under a {@link SoloProvider}. */
export function useSolo(): SoloController {
  const ctx = useContext(SoloContext);
  if (!ctx) throw new Error("useSolo must be used within a SoloProvider");
  return ctx;
}
