/**
 * The town's own materials, named after things in the world (not their roles).
 * Taken from the dusk mill-town palette in `private/GAME_DESIGN.md` and warmed
 * for a 3D diorama lit by a low evening sun.
 */
export const diorama = {
  // Ground and water
  meadow: "#6e9b5a",
  meadowDark: "#4f7a43",
  field: "#b7923f", // tilled co-op fields (wheat/cotton)
  river: "#5e8c93",
  riverDeep: "#3f6870",
  earth: "#5a4631",
  path: "#c6b58a",
  baseRock: "#2a333d", // the dark plinth the island sits on

  // Buildings
  plaster: "#e4d9c2",
  plasterWarm: "#d8c6a4",
  timber: "#6b4a2f",
  timberDark: "#4e3521",
  roofClay: "#b4553c",
  roofSlate: "#52606e",
  roofThatch: "#b9893f",
  stone: "#8a8577",
  stoneDark: "#5f5b50",

  // Accents / light
  wheat: "#d9a441",
  wheatLight: "#f2c76b",
  lamp: "#ffcf87",
  smithyGlow: "#ff7a3c",
  smoke: "#cdbfae",

  // Sky / fog at dusk
  sky: "#2b3a4f",
  skyLow: "#c9825a",
  fog: "#223041",
} as const;

/** Trade colours for the resident outfits and the workshop signs. */
export const tradeColor = {
  bakery: "#d9a441",
  weaver: "#5e8c93",
  smithy: "#b23a48",
  brewery: "#8a6f3a",
  apothecary: "#5fa36a",
  townhall: "#c8b273",
  coop: "#6e9b5a",
  mine: "#6b6b74",
} as const;
