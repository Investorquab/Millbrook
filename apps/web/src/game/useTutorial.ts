import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SoloView } from "@millbrook/economy";
import { tradeWords, type TradeWords } from "./tradeLabels";

/**
 * The guided first session. A five-beat coach-mark tour that walks a brand-new
 * player through the one loop that makes Millbrook click: hire → price → play →
 * first sale. It is pure guidance — nothing is locked. Auto steps advance when
 * the player actually does the thing (so the ring always points at live state),
 * manual steps wait for a button. It shows once per browser (localStorage) and
 * honours Skip. The highlight itself is CSS, driven by {@link Tour.target} which
 * the Town screen writes onto its root as `data-tour`.
 */

export type TourTarget = "hire" | "price" | "play" | null;

interface Baseline {
  price: number;
  workers: number;
}

interface Step {
  id: string;
  target: TourTarget;
  title: string;
  body: string;
  /** Manual steps wait for the Next/Finish button; auto steps advance on `done`. */
  manual?: boolean;
  cta?: string;
  hint?: string;
  done?: (v: SoloView, base: Baseline, running: boolean) => boolean;
}

const STORAGE_KEY = "millbrook.tour.v1";

/** The tour adapts to the trade the player chose (never "bakery/bread" unless
 *  they're the baker). */
function buildSteps(t: TradeWords): Step[] {
  const good = t.good.toLowerCase();
  return [
    {
      id: "welcome",
      target: null,
      manual: true,
      cta: "Show me",
      title: "Welcome to Millbrook",
      body: `You run the town ${t.shop}. Its 30 residents are your workers and your only customers. Let's make your first sale.`,
    },
    {
      id: "hire",
      target: "hire",
      title: `Hire a ${t.worker}`,
      body: `More ${t.worker}s means more ${good} to sell. Hire one and watch your crew grow.`,
      hint: `Hire a ${t.worker} to continue`,
      // Wait for an actual hire — the shop may already start with a worker on
      // the crew, so compare against the crew size when this step began.
      done: (v, base) => v.workers.length > base.workers,
    },
    {
      id: "price",
      target: "price",
      title: "Set a price the town can pay",
      body: `Nudge the ${good} price. Too high and residents can't afford it; too low and you barely profit.`,
      hint: "Change the price to continue",
      done: (v, base) => v.price !== base.price,
    },
    {
      id: "play",
      target: "play",
      title: "Let the days roll",
      body: `Press play to run the season. Each day residents earn wages and come to buy ${good}.`,
      hint: "Press play to continue",
      done: (_v, _base, running) => running,
    },
    {
      id: "sale",
      target: null,
      title: "Watch for your first sale",
      body: `When a resident buys some ${good}, gold flows to your ${t.shop} and “Sold today” ticks up.`,
      hint: "Waiting for the first sale…",
      done: (v) => v.soldToday > 0,
    },
    {
      id: "done",
      target: null,
      manual: true,
      cta: "I've got it",
      title: "You're running the town",
      body: "Keep Millbrook fed and employed. Tap a resident to see why they chose as they did, and watch the Game Master react to the weather.",
    },
  ];
}

export interface Tour {
  active: boolean;
  index: number;
  total: number;
  step: Step;
  /** Which control to highlight right now, or null. Null while inactive. */
  target: TourTarget;
  /** Advance a manual step (or finish on the last one). */
  next: () => void;
  /** Dismiss the tour and remember it. */
  skip: () => void;
}

export function useTutorial(view: SoloView, running: boolean): Tour {
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "done";
    } catch {
      return true;
    }
  });

  // Steps worded for the player's chosen trade.
  const steps = useMemo(() => buildSteps(tradeWords(view.workshopType)), [view.workshopType]);

  // The baseline for the current step — e.g. the price when the price step
  // began, so "they changed it" is relative to where they started.
  const baseRef = useRef<Baseline>({ price: view.price, workers: view.workers.length });
  useEffect(() => {
    baseRef.current = { price: view.price, workers: view.workers.length };
    // Re-baseline only when the step changes, not on every view tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const finish = useCallback(() => {
    setActive(false);
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* private mode / blocked storage — the tour simply won't be remembered. */
    }
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= steps.length - 1) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const skip = useCallback(() => finish(), [finish]);

  const step = steps[index] ?? steps[steps.length - 1]!;

  // Auto-advance when the current step's condition is met, after a short beat so
  // the player sees the result of what they just did.
  useEffect(() => {
    if (!active || step.manual || !step.done) return;
    if (step.done(view, baseRef.current, running)) {
      const t = setTimeout(next, 450);
      return () => clearTimeout(t);
    }
  }, [active, step, view, running, next]);

  return {
    active,
    index,
    total: steps.length,
    step,
    target: active ? step.target : null,
    next,
    skip,
  };
}
