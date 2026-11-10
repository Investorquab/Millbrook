/**
 * NEAR AI Cloud reasoning (OpenAI-compatible). The model is asked to pick one
 * event from the already-capped candidate list and explain it in a sentence or
 * two. It returns an index and a paragraph — it can never change a cap, because
 * it only ever selects among candidates the pure code built.
 *
 * No key, or any error, is not fatal: the caller falls back to a deterministic
 * pick and a template paragraph, and says so.
 */

import type { GmCandidate, TownSnapshot, WeatherReading } from "./types.js";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AiChoice {
  index: number;
  reasoning: string;
  model: string;
}

export type ChatFn = typeof fetch;

function buildPrompt(town: TownSnapshot, weather: WeatherReading, candidates: GmCandidate[]): string {
  const lines = candidates.map((c, i) => `${i}: ${c.title} — ${c.effect}`);
  return [
    "You are the Game Master of Millbrook, a small town with a fixed money supply.",
    "Choose exactly one event from the numbered list that best fits the town right now.",
    "You may not invent events or change their numbers; only pick one that is listed.",
    "",
    `Town: day ${town.day}/${town.seasonDays}, unemployment ${(town.unemployment * 100).toFixed(0)}%, ` +
      `average wage ${town.avgWage.toFixed(1)}, wheat price ${town.wheatPrice}, ` +
      `leader holds ${town.leaderCoins} coins vs runner-up ${town.runnerUpCoins}.`,
    `Weather: ${weather.tempC}°C, ${weather.condition} (${weather.label}).`,
    "",
    "Events:",
    ...lines,
    "",
    'Reply as JSON only: {"index": <number>, "reasoning": "<one or two sentences>"}.',
  ].join("\n");
}

/**
 * Ask NEAR AI Cloud to choose and explain. Throws on no key / bad response so
 * the caller can fall back. `chat` is injectable for tests.
 */
export async function chooseWithAi(
  cfg: AiConfig,
  town: TownSnapshot,
  weather: WeatherReading,
  candidates: GmCandidate[],
  chat: ChatFn = fetch,
): Promise<AiChoice> {
  if (!cfg.apiKey) throw new Error("no NEAR AI key");
  const res = await chat(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.4,
      messages: [
        { role: "system", content: "You pick one listed event and explain it briefly. JSON only." },
        { role: "user", content: buildPrompt(town, weather, candidates) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`NEAR AI HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("NEAR AI returned no content");
  const parsed = JSON.parse(extractJson(content)) as { index?: number; reasoning?: string };
  if (typeof parsed.index !== "number" || parsed.index < 0 || parsed.index >= candidates.length) {
    throw new Error("NEAR AI picked an out-of-range event");
  }
  return {
    index: parsed.index,
    reasoning: (parsed.reasoning ?? "").trim() || candidates[parsed.index]!.effect,
    model: json.model ?? cfg.model,
  };
}

/** Pull the first {...} object out of a model reply that may wrap it in prose. */
function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}
