/**
 * The receipt. In a real OutLayer TEE enclave the attestation is a hardware
 * quote proving which code ran on which data; here we stand that in with a
 * deterministic sha256 over the canonical inputs and decision, so anyone can
 * recompute the hashes and check the decision was not tampered with. The
 * on-chain anchor (scripts/post-receipt.ts) records the receiptHash on NEAR.
 */

import { createHash } from "node:crypto";
import type { GmDecision, GmReceipt, GmCandidate, TownSnapshot, WeatherReading } from "./types.js";

/** Stable JSON: object keys sorted, so the hash is reproducible. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface ReceiptInputs {
  town: TownSnapshot;
  weather: WeatherReading;
  candidates: GmCandidate[];
}

export function buildReceipt(
  inputs: ReceiptInputs,
  decision: GmDecision | null,
  opts: { enclave: GmReceipt["enclave"]; attestation: string; model: string | null; timestamp?: string },
): GmReceipt {
  const inputsHash = sha256(canonical(inputs));
  const decisionHash = sha256(canonical(decision));
  const timestamp = opts.timestamp ?? new Date().toISOString();
  const receiptHash = sha256(
    canonical({ inputsHash, decisionHash, enclave: opts.enclave, model: opts.model, timestamp }),
  );
  return {
    enclave: opts.enclave,
    attestation: opts.attestation,
    model: opts.model,
    feedSource: inputs.weather.source,
    inputsHash,
    decisionHash,
    receiptHash,
    timestamp,
  };
}

export { canonical as canonicalJson, sha256 };
