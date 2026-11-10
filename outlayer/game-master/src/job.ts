/**
 * The Game Master job, as it runs in the OutLayer enclave.
 *
 *   town snapshot + weather feed
 *        → eligible, already-capped candidates (pure)
 *        → NEAR AI picks one and explains it      (fallback: deterministic pick + template)
 *        → receipt (attested in the TEE; sha256 locally)
 *
 * Caps are enforced before the AI is involved, so no decision can ever exceed a
 * cap. If the weather feed or the AI is unavailable, the job falls back to town
 * metrics and a template, and says so in `notes` and in the receipt.
 */

import { eligibleCandidates, mayFire } from "./candidates.js";
import { fetchWeather, type Fetcher } from "./weather.js";
import { chooseWithAi, type AiConfig, type ChatFn } from "./nearai.js";
import { buildReceipt } from "./receipt.js";
import type { GmCandidate, GmDecision, GmJobResult, TownSnapshot, WeatherReading } from "./types.js";

export interface JobDeps {
  /** Injectable weather fetch (defaults to Open-Meteo). */
  weatherFetcher?: Fetcher;
  /** Injectable chat transport for NEAR AI (defaults to fetch). */
  chat?: ChatFn;
  /** NEAR AI config; omit or leave apiKey empty to force the fallback. */
  ai?: Partial<AiConfig>;
  /** Override the weather entirely (tests / replaying a receipt). */
  weather?: WeatherReading;
  timestamp?: string;
}

/** A deterministic fallback pick when NEAR AI is unavailable: the first
 *  candidate (the catalog is authored most-impactful first for a given state). */
function fallbackPick(candidates: GmCandidate[], town: TownSnapshot, weather: WeatherReading): GmDecision {
  const c = candidates[0]!;
  const feedNote =
    weather.source === "feed"
      ? `Weather feed (${weather.label}) read ${weather.tempC}°C, ${weather.condition}.`
      : `No live weather feed — running on town metrics.`;
  return {
    eventId: c.id,
    title: c.title,
    effect: c.effect,
    params: c.params,
    reasoning:
      `${feedNote} With unemployment at ${(town.unemployment * 100).toFixed(0)}% and wages averaging ` +
      `${town.avgWage.toFixed(1)}, the ${c.title.toLowerCase()} fits the town right now. ` +
      `(Template reasoning — no NEAR AI key configured.)`,
    reasoningSource: "fallback",
    model: null,
  };
}

export async function runGameMasterJob(town: TownSnapshot, deps: JobDeps = {}): Promise<GmJobResult> {
  const notes: string[] = [];

  // 1) Weather.
  const weather = deps.weather ?? (await fetchWeather(town.place, deps.weatherFetcher));
  if (weather.source === "fallback") notes.push(`Weather: ${weather.label}.`);

  // 2) Is the once-a-week window open?
  if (!mayFire(town)) {
    const receipt = buildReceipt({ town, weather, candidates: [] }, null, {
      enclave: "local-fallback",
      attestation: "unattested (local fallback)",
      model: null,
      timestamp: deps.timestamp,
    });
    notes.push("No event: the once-a-week window is not open yet.");
    return { weather, candidates: [], decision: null, receipt, notes };
  }

  // 3) Eligible, already-capped candidates.
  const candidates = eligibleCandidates(town, weather);
  if (candidates.length === 0) {
    const receipt = buildReceipt({ town, weather, candidates }, null, {
      enclave: "local-fallback",
      attestation: "unattested (local fallback)",
      model: null,
      timestamp: deps.timestamp,
    });
    notes.push("No event: nothing in the catalog is eligible for this town state.");
    return { weather, candidates, decision: null, receipt, notes };
  }

  // 4) Choose: NEAR AI if configured, else the deterministic fallback.
  const ai: AiConfig = {
    apiKey: deps.ai?.apiKey ?? "",
    baseUrl: deps.ai?.baseUrl ?? "https://cloud-api.near.ai/v1",
    model: deps.ai?.model ?? "",
  };
  let decision: GmDecision;
  let enclave: GmJobResult["receipt"]["enclave"] = "local-fallback";
  let attestation = "unattested (local fallback)";
  let model: string | null = null;

  try {
    if (!ai.apiKey) throw new Error("no NEAR AI key");
    const choice = await chooseWithAi(ai, town, weather, candidates, deps.chat);
    const c = candidates[choice.index]!;
    decision = {
      eventId: c.id,
      title: c.title,
      effect: c.effect,
      params: c.params, // caps come from the candidate, never the model
      reasoning: choice.reasoning,
      reasoningSource: "near-ai",
      model: choice.model,
    };
    enclave = "outlayer-tee";
    attestation = "TEE attestation attached by the OutLayer enclave at run time";
    model = choice.model;
  } catch (e) {
    notes.push(`NEAR AI unavailable (${(e as Error).message}) — deterministic pick + template reasoning.`);
    decision = fallbackPick(candidates, town, weather);
  }

  const receipt = buildReceipt({ town, weather, candidates }, decision, {
    enclave,
    attestation,
    model,
    timestamp: deps.timestamp,
  });

  return { weather, candidates, decision, receipt, notes };
}
