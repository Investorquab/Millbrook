import { useCallback, useEffect, useRef, useState } from "react";
import { createSoloSession, type SoloSession, type SoloView } from "@millbrook/economy";

/** How long a game day takes while the town is "playing" (ms). */
const DAY_MS = 1200;

export interface SoloController {
  view: SoloView;
  running: boolean;
  play: () => void;
  pause: () => void;
  stepOnce: () => void;
  setPrice: (n: number) => void;
  setWage: (n: number) => void;
  hire: () => void;
}

/**
 * Drives a {@link SoloSession} from React. The session itself is the pure,
 * deterministic engine from `@millbrook/economy`; this hook just mirrors its
 * view into state and advances the clock while "playing".
 *
 * The seed is fixed so a playthrough (and the e2e tests) are reproducible; a
 * future "new season" action can pass a fresh seed.
 */
export function useSoloSession(seed = 42): SoloController {
  const ref = useRef<SoloSession | null>(null);
  if (ref.current === null) ref.current = createSoloSession(seed);

  const [view, setView] = useState<SoloView>(() => ref.current!.view());
  const [running, setRunning] = useState(false);

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

  const play = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);

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

  return { view, running, play, pause, stepOnce, setPrice, setWage, hire };
}
