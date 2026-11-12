import { createContext, useContext, useMemo } from "react";
import { rules } from "@millbrook/economy";
import type { WorkshopType } from "@millbrook/shared";
import { useSolo } from "../game/SoloProvider";

/**
 * The slice of town state the 3D diorama needs to render, decoupled from the
 * game engine so the same scene can be driven by the local solo session OR by a
 * snapshot the server sends to a room. Solo passes nothing and the hook falls
 * back to the live `SoloProvider` session, so the solo scene is unchanged.
 */
export interface TownWorkshop {
  id: string;
  type: WorkshopType;
  busy: boolean;
  bankrupt: boolean;
}
export interface TownOwner {
  /** Strategy key ("gus"/"fern"/…), or null for the player's shop. */
  strategy: string | null;
  workshopId: string;
}
export interface TownResident {
  id: string;
  employerId: string | null;
  reason: string;
}
export interface TownData {
  workshops: TownWorkshop[];
  owners: TownOwner[];
  residents: TownResident[];
  /** The workshop the viewer runs (for the "your shop" highlight). */
  playerWorkshopId: string;
  soldToday: number;
  day: number;
}

export const TownDataContext = createContext<TownData | null>(null);

/**
 * Read town data from the context (a room snapshot) if present, otherwise derive
 * it from the live solo session. Memoised per game day so the meshes don't churn.
 */
export function useTownData(): TownData {
  const ctx = useContext(TownDataContext);
  const solo = useSolo();
  return useMemo<TownData>(() => {
    if (ctx) return ctx;
    const world = solo.session.world;
    return {
      workshops: [...world.workshops.values()].map((w) => ({
        id: w.id,
        type: w.type,
        busy: w.soldToday > 0.5,
        bankrupt: w.bankrupt,
      })),
      owners: [...world.owners.values()].map((o) => ({ strategy: o.strategy, workshopId: o.workshopId })),
      residents: rules.aliveResidents(world).map((r) => ({
        id: r.id,
        employerId: r.employerId,
        reason: r.lastReason,
      })),
      playerWorkshopId: solo.session.playerWorkshopId,
      soldToday: solo.view.soldToday,
      day: solo.view.day,
    };
  }, [ctx, solo.session, solo.view.day, solo.view.soldToday]);
}
