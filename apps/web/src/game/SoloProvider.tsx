import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SoloSession, type SoloView } from "@millbrook/economy";
import type { WorkshopType } from "@millbrook/shared";

/** How long a game day takes while the town is "playing" (ms). */
const DAY_MS = 1200;

/** How many workshops the town opens. The classic town is four; the full town
 *  adds the Tailor (buys cloth from the Weaver) and the Tavern (buys bread from
 *  the Bakery); the seven-shop town adds the Apothecary (buys herbs from the
 *  Co-op, sells remedies — demand jumps in an epidemic). Owners are ordered so
 *  the supply-chain and specialist shops get able owners, never Greedy Gus. */
export type TownSize = 4 | 6 | 7 | 8;
const TOWN_WORKSHOPS: Record<TownSize, string[]> = {
  4: ["bakery", "weaver", "smithy", "brewery"],
  6: ["bakery", "smithy", "weaver", "tailor", "tavern", "brewery"],
  7: ["bakery", "smithy", "weaver", "tailor", "tavern", "brewery", "apothecary"],
  8: ["bakery", "smithy", "weaver", "tailor", "tavern", "brewery", "apothecary", "carpenter"],
};

function makeSession(seed: number, size: TownSize, trade: WorkshopType, goalCard = "tycoon"): SoloSession {
  const shops = TOWN_WORKSHOPS[size];
  // The player's trade must be one the town opens; fall back to the bakery.
  const playerTrade = (shops.includes(trade) ? trade : "bakery") as WorkshopType;
  return new SoloSession({ seed, days: 28, openWorkshops: shops as never, playerTrade, goalCard });
}

/** The trades a town of this size opens, for the Hub's trade picker. */
export function tradesForTown(size: TownSize): WorkshopType[] {
  return TOWN_WORKSHOPS[size] as WorkshopType[];
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
  setInsured: (on: boolean) => void;
  setGuard: (on: boolean) => void;
  setSickPay: (on: boolean) => void;
  hire: () => void;
  /** Bid on a failed rival's premises at auction (takes it over), or pass. */
  takeOverAuction: (workshopId: string) => void;
  passAuction: (workshopId: string) => void;
  /** Answer a decision card (wage demand, loan offer, …). */
  decide: (decisionId: string, optionId: string) => void;
  /** How many workshops the current town has (4 classic, 6 full town, 7 with the Apothecary). */
  townSize: TownSize;
  /** Start a fresh season with a chosen town size (resets the season). */
  setTownSize: (size: TownSize) => void;
  /** The trade the player runs this season (bakery, weaver, smithy…). */
  playerTrade: WorkshopType;
  /** Start a fresh season running a chosen trade (resets the season). */
  setPlayerTrade: (trade: WorkshopType) => void;
  /** The goal card the season is scored against. */
  goalCard: string;
  /** Start a fresh season scored against a chosen goal card (resets the season,
   *  so a card's opening setup is applied cleanly from day 0). */
  setGoalCard: (id: string) => void;
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
  if (ref.current === null) ref.current = makeSession(seed, 4, "bakery", "tycoon");

  const [view, setView] = useState<SoloView>(() => ref.current!.view());
  const [running, setRunning] = useState(false);
  const [townSize, setTownSizeState] = useState<TownSize>(4);
  const [playerTrade, setPlayerTradeState] = useState<WorkshopType>("bakery");
  const [goalCard, setGoalCardState] = useState<string>("tycoon");

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

  const setInsured = useCallback(
    (on: boolean) => {
      ref.current!.setInsured(on);
      refresh();
    },
    [refresh],
  );

  const setGuard = useCallback(
    (on: boolean) => {
      ref.current!.setGuard(on);
      refresh();
    },
    [refresh],
  );

  const setSickPay = useCallback(
    (on: boolean) => {
      ref.current!.setSickPay(on);
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

  const decide = useCallback(
    (id: string, optionId: string) => {
      ref.current!.decide(id, optionId);
      refresh();
    },
    [refresh],
  );

  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);

  const newSeason = useCallback(
    (nextSeed = seed) => {
      ref.current = makeSession(nextSeed, townSize, playerTrade, goalCard);
      setRunning(false);
      refresh();
    },
    [refresh, seed, townSize, playerTrade, goalCard],
  );

  const setTownSize = useCallback(
    (size: TownSize) => {
      // Keep the chosen trade if the new town still opens it, else fall back.
      const shops = tradesForTown(size);
      const trade = shops.includes(playerTrade) ? playerTrade : "bakery";
      ref.current = makeSession(seed, size, trade, goalCard);
      setTownSizeState(size);
      setPlayerTradeState(trade);
      setRunning(false);
      refresh();
    },
    [refresh, seed, playerTrade, goalCard],
  );

  const setPlayerTrade = useCallback(
    (trade: WorkshopType) => {
      ref.current = makeSession(seed, townSize, trade, goalCard);
      setPlayerTradeState(trade);
      setRunning(false);
      refresh();
    },
    [refresh, seed, townSize, goalCard],
  );

  const setGoalCard = useCallback(
    (id: string) => {
      // Rebuild from a fresh world so the card's opening setup (Underdog's lop-
      // sided purses, the Great Depression's layoffs) is applied cleanly once.
      ref.current = makeSession(seed, townSize, playerTrade, id);
      setGoalCardState(id);
      setRunning(false);
      refresh();
    },
    [refresh, seed, townSize, playerTrade],
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
    setInsured,
    setGuard,
    setSickPay,
    hire,
    takeOverAuction,
    passAuction,
    decide,
    townSize,
    setTownSize,
    playerTrade,
    setPlayerTrade,
    goalCard,
    setGoalCard,
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
