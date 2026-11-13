import { describe, expect, it, afterEach } from "vitest";
import { writeGazetteWithAi, aiConfigFromEnv, type AiConfig } from "./gazette-ai.js";

const CFG: AiConfig = { apiKey: "k", baseUrl: "https://cloud-api.near.ai/v1", model: "test-model" };
const REQ = { week: 2, printDay: 14, events: ["The weaver went on strike over low pay.", "Fair Fern raised wages."] };

function jsonFetch(status: number, body: unknown): typeof fetch {
  return (async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

describe("writeGazetteWithAi", () => {
  it("returns a lead story from the model's JSON", async () => {
    const chat = jsonFetch(200, {
      model: "test-model",
      choices: [{ message: { content: '{"heading":"Strike at the weaver","paragraphs":["Workers downed tools.","Fern paid up."]}' } }],
    });
    const r = await writeGazetteWithAi(CFG, REQ, chat);
    expect(r.source).toBe("near-ai");
    expect(r.lead.heading).toBe("Strike at the weaver");
    expect(r.lead.paragraphs).toHaveLength(2);
  });

  it("extracts JSON even when the model wraps it in prose", async () => {
    const chat = jsonFetch(200, {
      choices: [{ message: { content: 'Here you go:\n{"heading":"Quiet week","paragraphs":["All calm."]}\nHope that helps!' } }],
    });
    const r = await writeGazetteWithAi(CFG, REQ, chat);
    expect(r.lead.heading).toBe("Quiet week");
  });

  it("throws on no key, so the caller keeps the template", async () => {
    await expect(writeGazetteWithAi({ ...CFG, apiKey: "" }, REQ)).rejects.toThrow(/no NEAR AI key/);
  });

  it("throws on a 402 (no spending limit), so the caller keeps the template", async () => {
    await expect(writeGazetteWithAi(CFG, REQ, jsonFetch(402, { error: "no_limit_configured" }))).rejects.toThrow(/HTTP 402/);
  });

  it("throws on an empty or malformed story", async () => {
    const chat = jsonFetch(200, { choices: [{ message: { content: '{"heading":"","paragraphs":[]}' } }] });
    await expect(writeGazetteWithAi(CFG, REQ, chat)).rejects.toThrow(/empty story/);
  });
});

describe("aiConfigFromEnv", () => {
  afterEach(() => {
    delete process.env.NEAR_AI_API_KEY;
  });

  it("returns null without a key", () => {
    expect(aiConfigFromEnv({})).toBeNull();
  });

  it("builds a config with sensible defaults from a key", () => {
    const cfg = aiConfigFromEnv({ NEAR_AI_API_KEY: "secret" });
    expect(cfg).toMatchObject({ apiKey: "secret", baseUrl: "https://cloud-api.near.ai/v1" });
    expect(cfg?.model).toBeTruthy();
  });
});
