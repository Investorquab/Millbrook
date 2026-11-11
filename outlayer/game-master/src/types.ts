/**
 * Types for the OutLayer Game Master job. Kept independent of the economy
 * package: the enclave reads a plain town snapshot (so it can run anywhere) and
 * returns a decision plus a receipt.
 */

import type { RawGood } from "@millbrook/shared";

/** The town state the Game Master reads. A snapshot, not the live world. */
export interface TownSnapshot {
  day: number;
  seasonDays: number;
  /** 0..1 */
  unemployment: number;
  avgWage: number;
  wheatPrice: number;
  /** Coins held by the richest / second-richest open workshop. */
  leaderCoins: number;
  runnerUpCoins: number;
  /** Game days since the last event fired (Infinity if none yet). */
  daysSinceLastEvent: number;
  /** For the weather feed; defaults to the host city. */
  place?: { lat: number; lon: number; label: string };
}

export interface WeatherReading {
  tempC: number;
  condition: "heat" | "storm" | "calm";
  /** "feed" = a live reading; "fallback" = the feed was unavailable. */
  source: "feed" | "fallback";
  label: string;
}

/** The capped parameters of one event. Durations and multipliers are already
 *  clamped to the catalog's hard caps — the AI chooses among these, it never
 *  sets them. */
export interface GmParams {
  rawGood?: RawGood;
  rawPriceMultiplier?: number;
  outputMultiplier?: number;
  demandMultiplier?: number;
  breadPriceCeiling?: number;
  workshopOutputMultiplier?: number;
  /** A one-time coin-safe effect the server applies (never player→player). */
  oneTime?: "tax_inspector" | "migration_wave";
  durationDays: number;
}

export interface GmCandidate {
  id: string;
  title: string;
  effect: string;
  trigger: string;
  params: GmParams;
}

export interface GmDecision {
  eventId: string;
  title: string;
  effect: string;
  params: GmParams;
  /** One paragraph for the "Why did this happen?" card. */
  reasoning: string;
  reasoningSource: "near-ai" | "fallback";
  model: string | null;
}

/** The receipt the job returns, labelled by where the decision was actually
 *  made: "outlayer-tee" only when the job ran inside an OutLayer enclave (a real
 *  hardware quote — not wired yet); "near-ai-cloud" when NEAR AI Cloud chose the
 *  event on the game server; "local-fallback" when the deterministic template
 *  picked it. The hashes let anyone recompute and verify the decision against the
 *  inputs regardless. We never claim a TEE attestation we didn't get. */
export interface GmReceipt {
  enclave: "outlayer-tee" | "near-ai-cloud" | "local-fallback";
  attestation: string;
  model: string | null;
  feedSource: "feed" | "fallback";
  inputsHash: string;
  decisionHash: string;
  receiptHash: string;
  timestamp: string;
}

export interface GmJobResult {
  weather: WeatherReading;
  candidates: GmCandidate[];
  /** null when no event fires this tick. */
  decision: GmDecision | null;
  receipt: GmReceipt;
  /** Honest notes, e.g. which fallbacks were used. */
  notes: string[];
}
