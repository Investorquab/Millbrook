/**
 * Where everything sits on the island. One fixed layout (deterministic), echoing
 * the `design/assets/town.svg` composition: a central square with the four
 * workshops around it, the Town Hall at the back, the Co-op fields and the mine
 * at the edges, houses scattered between, a river crossing the front, trees at
 * the rim. Coordinates are world units on the XZ plane; +Z is toward the camera.
 */
import type { WorkshopType } from "@millbrook/shared";

export type Vec2 = [number, number]; // [x, z]

export interface BuildingSpot {
  /** Which workshop lives here (the player runs the bakery). */
  type: WorkshopType;
  pos: Vec2;
  /** Y-rotation in radians, so the front faces roughly toward the square. */
  rot: number;
}

/** The workshops, placed around the central square. The first four are the
 *  classic town; the Tailor and Tavern appear in a full (six-shop) town, and the
 *  Apothecary in a seven-shop town — the scene renders a spot only when that
 *  workshop exists this season. */
export const WORKSHOPS: BuildingSpot[] = [
  { type: "bakery", pos: [-3.1, 2.6], rot: 0.25 },
  { type: "weaver", pos: [3.2, 2.4], rot: -0.3 },
  { type: "smithy", pos: [3.4, -2.6], rot: -2.5 },
  { type: "brewery", pos: [-3.3, -2.5], rot: 2.6 },
  { type: "tailor", pos: [-1.7, 4.4], rot: 0.2 },
  { type: "tavern", pos: [2.0, -4.3], rot: 2.9 },
  { type: "apothecary", pos: [4.9, 0.0], rot: -1.6 },
];

/** The square's well sits at the middle of town. */
export const WELL: Vec2 = [0, 0.2];

/** Town Hall — bigger, at the back, its facade (columns + clock) facing the
 *  square and the camera (front of the model is +z). */
export const TOWN_HALL: { pos: Vec2; rot: number } = { pos: [0, -5.4], rot: 0 };

/** Co-op: tilled fields and a barn at the left edge. */
export const COOP = {
  barn: { pos: [-6.4, -0.3] as Vec2, rot: 1.1 },
  fields: [
    { pos: [-6.6, 2.4] as Vec2, crop: "wheat" as const },
    { pos: [-5.4, 3.9] as Vec2, crop: "cotton" as const },
  ],
};

/** The mine, cut into a rocky rise at the right edge. */
export const MINE: { pos: Vec2; rot: number } = { pos: [6.4, 0.2], rot: -1.3 };

/** Homes the residents walk back to. */
export const HOUSES: { pos: Vec2; rot: number; tone: number }[] = [
  { pos: [-1.6, 5.3], rot: 0.1, tone: 0 },
  { pos: [1.5, 5.4], rot: -0.15, tone: 1 },
  { pos: [4.9, 4.6], rot: -0.6, tone: 2 },
  { pos: [-4.8, 4.8], rot: 0.6, tone: 1 },
  { pos: [5.6, -4.7], rot: -2.2, tone: 0 },
  { pos: [-5.7, -4.6], rot: 2.2, tone: 2 },
  { pos: [2.1, -5.6], rot: 3.0, tone: 1 },
  { pos: [-2.2, -5.7], rot: 3.3, tone: 0 },
];

/** The river runs across the front of the island (a gentle S of segments). */
export const RIVER: Vec2[] = [
  [-8, 6.6],
  [-3.5, 6.0],
  [0, 6.7],
  [3.5, 6.1],
  [8, 6.8],
];

/** Trees around the rim; [x, z, scale]. Instanced. */
export const TREES: [number, number, number][] = [
  [-7.2, -3.2, 1.0], [-7.6, -1.2, 0.8], [7.3, 3.1, 0.9], [7.7, 1.3, 1.1],
  [-2.0, -7.1, 1.0], [2.3, -7.0, 0.85], [6.8, -6.2, 0.9], [-6.9, -6.3, 1.0],
  [7.0, 5.6, 0.8], [-7.1, 5.7, 0.9], [0.2, -7.4, 0.7], [-4.4, -6.9, 0.8],
];

/** Radius of the round island; anything past this is the dark plinth/sky. */
export const ISLAND_RADIUS = 8.6;
