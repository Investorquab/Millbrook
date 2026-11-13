/**
 * The Gazette, written by NEAR AI Cloud (OpenAI-compatible) from the week's REAL
 * events (Step 3.4). The model only ever rewrites facts the game already
 * recorded — it is told to invent nothing — and returns a lead story as JSON.
 *
 * No key, a 402 (no spending limit configured), or any other error is NOT fatal:
 * the caller keeps the deterministic template Gazette the economy already builds.
 * So the feature ships and works with or without a funded NEAR AI budget.
 */

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface GazetteRequest {
  week: number;
  printDay: number;
  /** The week's real feed lines — the only facts the model may use. */
  events: string[];
}

export interface GazetteStory {
  heading: string;
  paragraphs: string[];
}

export interface GazetteResult {
  source: "near-ai";
  model: string;
  lead: GazetteStory;
}

export type ChatFn = typeof fetch;

function buildPrompt(req: GazetteRequest): string {
  return [
    "You are the editor of the Millbrook Gazette, the weekly paper of a small town",
    "with a fixed money supply of exactly 10,000 coins that never leave town.",
    "",
    `Write the lead story for the Week ${req.week} edition (day ${req.printDay}).`,
    "Use ONLY the real events listed below — invent no names, numbers, or events.",
    "Keep it warm, plain and concrete: one heading and two short paragraphs.",
    "If the list is thin, write a calm 'quiet week' piece; never pad with invented drama.",
    "",
    "This week's events:",
    ...(req.events.length ? req.events.map((e) => `- ${e}`) : ["- (a quiet week; nothing notable was recorded)"]),
    "",
    'Reply as JSON only: {"heading": "<headline>", "paragraphs": ["<para 1>", "<para 2>"]}.',
  ].join("\n");
}

/**
 * Ask NEAR AI to write the lead story. Throws on no key / bad response so the
 * caller can fall back to the template. `chat` is injectable for tests.
 */
export async function writeGazetteWithAi(
  cfg: AiConfig,
  req: GazetteRequest,
  chat: ChatFn = fetch,
): Promise<GazetteResult> {
  if (!cfg.apiKey) throw new Error("no NEAR AI key");
  const res = await chat(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.5,
      messages: [
        { role: "system", content: "You are a small-town newspaper editor. Report only the given facts. JSON only." },
        { role: "user", content: buildPrompt(req) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`NEAR AI HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[]; model?: string };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("NEAR AI returned no content");
  const parsed = JSON.parse(extractJson(content)) as { heading?: string; paragraphs?: unknown };
  const paragraphs = Array.isArray(parsed.paragraphs)
    ? parsed.paragraphs.filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 3)
    : [];
  if (!parsed.heading || paragraphs.length === 0) throw new Error("NEAR AI returned an empty story");
  return {
    source: "near-ai",
    model: json.model ?? cfg.model,
    lead: { heading: String(parsed.heading).slice(0, 120), paragraphs },
  };
}

/** Pull the first {...} object out of a reply that may wrap it in prose. */
function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

/** Build an AiConfig from the environment (process.env, then a provided file map). */
export function aiConfigFromEnv(file: Record<string, string> = {}): AiConfig | null {
  const get = (k: string) => (process.env[k] ?? file[k] ?? "").trim();
  const apiKey = get("NEAR_AI_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: get("NEAR_AI_BASE_URL") || "https://cloud-api.near.ai/v1",
    model: get("NEAR_AI_MODEL") || "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  };
}
