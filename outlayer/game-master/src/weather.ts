/**
 * The real-world weather feed. Open-Meteo is keyless, so this needs no secret.
 * If the feed is unreachable, it returns a `fallback` reading and the job says
 * so — the Game Master then runs on town metrics only, as the design allows.
 */

import type { WeatherReading } from "./types.js";

/** The host city by default (Lagos); override per town. */
export const DEFAULT_PLACE = { lat: 6.4541, lon: 3.3947, label: "Lagos" };

/** WMO weather codes: 95–99 thunderstorm, 80–82 rain showers, 71–77 snow. */
function conditionFrom(tempC: number, code: number): WeatherReading["condition"] {
  if ((code >= 95 && code <= 99) || (code >= 80 && code <= 82) || (code >= 71 && code <= 77)) {
    return "storm";
  }
  if (tempC >= 32) return "heat";
  return "calm";
}

export type Fetcher = typeof fetch;

/**
 * Read the current weather. Pass a `fetcher` to inject one in tests. On any
 * failure returns a calm `fallback` reading rather than throwing.
 */
export async function fetchWeather(
  place: { lat: number; lon: number; label: string } = DEFAULT_PLACE,
  fetcher: Fetcher = fetch,
): Promise<WeatherReading> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}` +
    `&longitude=${place.lon}&current=temperature_2m,weather_code`;
  try {
    const res = await fetcher(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const tempC = json.current?.temperature_2m;
    const code = json.current?.weather_code ?? 0;
    if (typeof tempC !== "number") throw new Error("no temperature in response");
    return {
      tempC: Math.round(tempC),
      condition: conditionFrom(tempC, code),
      source: "feed",
      label: `Open-Meteo, ${place.label}`,
    };
  } catch (e) {
    return {
      tempC: 0,
      condition: "calm",
      source: "fallback",
      label: `no live weather feed (${(e as Error).message}); using town metrics`,
    };
  }
}
