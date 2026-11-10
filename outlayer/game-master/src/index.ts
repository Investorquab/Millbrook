/**
 * @millbrook/game-master — the Game Master job that runs in an OutLayer TEE
 * enclave. The server (M5) calls `runGameMasterJob` once per game day; the pure
 * solo simulation in `@millbrook/economy` carries its own in-process copy of the
 * same capped catalog for offline play.
 */

export { runGameMasterJob, type JobDeps } from "./job.js";
export { eligibleCandidates, mayFire } from "./candidates.js";
export { fetchWeather, DEFAULT_PLACE } from "./weather.js";
export { chooseWithAi, type AiConfig } from "./nearai.js";
export { buildReceipt, canonicalJson, sha256 } from "./receipt.js";
export type {
  TownSnapshot,
  WeatherReading,
  GmParams,
  GmCandidate,
  GmDecision,
  GmReceipt,
  GmJobResult,
} from "./types.js";
