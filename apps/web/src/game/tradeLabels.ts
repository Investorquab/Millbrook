import type { WorkshopType } from "@millbrook/shared";

/**
 * Player-facing words for each trade, so the HUD, tutorial and resident card
 * read correctly whatever the player runs — never "bakery/bread" unless they're
 * the baker. `good` is the finished good (title case for labels), `unit` its
 * countable noun, `worker` the person you hire.
 */
export interface TradeWords {
  shop: string;
  good: string;
  unit: string;
  worker: string;
  /** A one-line note for the Hub's trade picker: what it makes and the catch. */
  note: string;
}

export const TRADE_WORDS: Record<WorkshopType, TradeWords> = {
  bakery: { shop: "bakery", good: "Bread", unit: "loaves", worker: "baker", note: "Bread from wheat. Everyone eats daily — steady sales, thin margins." },
  weaver: { shop: "weaver", good: "Cloth", unit: "bolts", worker: "weaver", note: "Cloth from cotton. Feeds the Tailor; residents buy it weekly." },
  smithy: { shop: "smithy", good: "Tools", unit: "tools", worker: "smith", note: "Tools from iron. Few sales, high price — every shop needs tools." },
  brewery: { shop: "brewery", good: "Ale", unit: "casks", worker: "brewer", note: "Ale from wheat. A treat residents buy with spare coins." },
  tailor: { shop: "tailor shop", good: "Clothes", unit: "garments", worker: "tailor", note: "Clothes from the Weaver's cloth. A supply chain to manage." },
  tavern: { shop: "tavern", good: "Meals", unit: "meals", worker: "cook", note: "Meals from the Bakery's bread. Busy when the town's flush." },
  carpenter: { shop: "carpentry workshop", good: "House parts", unit: "parts", worker: "carpenter", note: "House parts from timber. Build homes so more residents move in." },
  apothecary: { shop: "apothecary", good: "Remedies", unit: "remedies", worker: "helper", note: "Remedies from herbs. Quiet most days, vital in an epidemic." },
};

export function tradeWords(type: WorkshopType): TradeWords {
  return TRADE_WORDS[type] ?? TRADE_WORDS.bakery;
}
