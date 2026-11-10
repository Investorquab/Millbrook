/**
 * Design tokens — the single source of colour, type and spacing for the UI.
 * Taken from `design/README.md` and `private/GAME_DESIGN.md`. Use only these
 * values; the colours come from a mill town at dusk, and the one bold element
 * is the gold coin flow. Everything else stays quiet.
 */

export const color = {
  // Panels and page
  millstone: "#2F3640",
  deep: "#1E242B",
  inset: "#232A32",
  // Text
  linen: "#EDE6D6",
  textSecondary: "#B9B2A4",
  textSoft: "#CFC8B8",
  // Wheat gold — coins, primary action, the coin flow, the brass edge
  wheat: "#D9A441",
  wheatLight: "#F2C76B",
  wheatShadow: "#A8761F",
  // Meadow — profit, good events
  meadow: "#6E9B5A",
  meadowText: "#8FC07A",
  // Madder — losses, strikes, warnings
  madder: "#B23A48",
  madderText: "#E58A94",
  // River — links, selection, the Proof panel
  river: "#5E8C93",
  riverText: "#8FB8C0",
  // Scene backdrop behind the diorama
  sky: "#27384a",
} as const;

export const font = {
  /** Headings, building signs, the Gazette masthead. */
  display: "'Grenze', Georgia, 'Times New Roman', serif",
  /** Everything else. */
  body: "'Barlow', system-ui, sans-serif",
  /** Numbers — tabular figures so prices don't jump around. */
  number: "'Barlow Semi Condensed', 'Barlow', system-ui, sans-serif",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  panel: 16,
  hero: 20,
} as const;

/** Brass edge used on main panels; decision cards use a 2px solid wheat edge. */
export const brassEdge = "1px solid rgba(217,164,65,0.5)";
export const brassEdgeStrong = "2px solid #D9A441";

/** Primary button look: wheat fill, millstone text, hard bottom shadow. */
export const primaryButtonShadow = `0 3px 0 ${color.wheatShadow}`;

export const space = (n: number) => `${n * 4}px`;
