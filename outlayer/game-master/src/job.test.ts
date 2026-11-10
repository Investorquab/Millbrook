import { describe, it, expect } from "vitest";
import { GAME_MASTER_EVENTS } from "@millbrook/shared";
import { runGameMasterJob } from "./job.js";
import { buildReceipt } from "./receipt.js";
import type { ChatFn } from "./nearai.js";
import type { TownSnapshot, WeatherReading } from "./types.js";

const capsById = new Map(GAME_MASTER_EVENTS.map((e) => [e.id, e.caps]));

const CALM: WeatherReading = { tempC: 20, condition: "calm", source: "feed", label: "test feed" };
const HEAT: WeatherReading = { tempC: 36, condition: "heat", source: "feed", label: "test feed" };

function town(partial: Partial<TownSnapshot> = {}): TownSnapshot {
  return {
    day: 14,
    seasonDays: 28,
    unemployment: 0.18,
    avgWage: 7.5,
    wheatPrice: 3,
    leaderCoins: 2200,
    runnerUpCoins: 1200,
    daysSinceLastEvent: 8,
    ...partial,
  };
}

describe("OutLayer Game Master job", () => {
  it("falls back to town metrics + template reasoning when there is no AI key, and says so", async () => {
    const r = await runGameMasterJob(town(), { weather: CALM });
    expect(r.decision).not.toBeNull();
    expect(r.decision!.reasoningSource).toBe("fallback");
    expect(r.decision!.model).toBeNull();
    expect(r.receipt.enclave).toBe("local-fallback");
    expect(r.notes.join(" ")).toMatch(/NEAR AI unavailable/);
  });

  it("marks a down weather feed and keeps running on metrics", async () => {
    const down: WeatherReading = { tempC: 0, condition: "calm", source: "fallback", label: "no live weather feed; using town metrics" };
    const r = await runGameMasterJob(town(), { weather: down });
    expect(r.receipt.feedSource).toBe("fallback");
    expect(r.notes.join(" ")).toMatch(/no live weather feed/i);
    // An event can still fire on metrics alone.
    expect(r.decision).not.toBeNull();
  });

  it("never proposes an event beyond its catalog cap", async () => {
    const r = await runGameMasterJob(town({ day: 20 }), { weather: HEAT });
    for (const c of r.candidates) {
      const caps = capsById.get(c.id)!;
      expect(c.params.durationDays).toBeLessThanOrEqual(caps.maxDays);
      if (c.params.rawPriceMultiplier && caps.maxPriceMultiplier && c.params.rawPriceMultiplier > 1) {
        expect(c.params.rawPriceMultiplier).toBeLessThanOrEqual(caps.maxPriceMultiplier);
      }
    }
    if (r.decision) {
      const caps = capsById.get(r.decision.eventId)!;
      expect(r.decision.params.durationDays).toBeLessThanOrEqual(caps.maxDays);
    }
  });

  it("holds no event when the weekly window is closed", async () => {
    const r = await runGameMasterJob(town({ daysSinceLastEvent: 3, day: 14 }), { weather: CALM });
    expect(r.decision).toBeNull();
    expect(r.notes.join(" ")).toMatch(/once-a-week window/);
  });

  it("lets an AI model pick among candidates but cannot change the caps", async () => {
    // A fake NEAR AI that always picks index 0 but tries to smuggle a huge
    // duration in its reply. The job must ignore the model's params entirely.
    const fakeChat: ChatFn = (async () =>
      new Response(
        JSON.stringify({
          model: "fake-model",
          choices: [{ message: { content: '{"index":0,"reasoning":"Because I said so.","durationDays":9999}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as ChatFn;

    const r = await runGameMasterJob(town({ day: 20 }), {
      weather: HEAT,
      ai: { apiKey: "sk-test", baseUrl: "https://example.test/v1", model: "fake-model" },
      chat: fakeChat,
    });
    expect(r.decision!.reasoningSource).toBe("near-ai");
    expect(r.decision!.reasoning).toContain("Because I said so");
    // The params came from the capped candidate, not the model's 9999.
    const caps = capsById.get(r.decision!.eventId)!;
    expect(r.decision!.params.durationDays).toBeLessThanOrEqual(caps.maxDays);
    expect(r.receipt.enclave).toBe("outlayer-tee");
  });

  it("falls back if the model picks an out-of-range event", async () => {
    const badChat: ChatFn = (async () =>
      new Response(
        JSON.stringify({ model: "m", choices: [{ message: { content: '{"index":999,"reasoning":"nope"}' } }] }),
        { status: 200 },
      )) as unknown as ChatFn;
    const r = await runGameMasterJob(town(), {
      weather: CALM,
      ai: { apiKey: "sk-test", baseUrl: "https://example.test/v1", model: "m" },
      chat: badChat,
    });
    expect(r.decision!.reasoningSource).toBe("fallback");
  });

  it("produces a stable, recomputable receipt hash", () => {
    const inputs = { town: town(), weather: CALM, candidates: [] };
    const a = buildReceipt(inputs, null, { enclave: "local-fallback", attestation: "x", model: null, timestamp: "2026-11-10T00:00:00.000Z" });
    const b = buildReceipt(inputs, null, { enclave: "local-fallback", attestation: "x", model: null, timestamp: "2026-11-10T00:00:00.000Z" });
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(a.receiptHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
