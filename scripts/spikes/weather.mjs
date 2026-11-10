/**
 * M0 spike — the real-world weather feed for the Game Master. Uses Open-Meteo,
 * which needs NO API key, so this runs today with nothing in .env. It fetches the
 * current weather for a city and maps it to the kind of Game Master event the
 * town would see (heatwave, storm, calm), proving the feed → event path.
 *
 *   node scripts/spikes/weather.mjs            # default city (London)
 *   node scripts/spikes/weather.mjs 6.45 3.39  # a lat/lon (Lagos)
 *
 * Prints OK or a clear error. No key, no secrets.
 */

const [latArg, lonArg] = process.argv.slice(2);
const lat = latArg ? Number(latArg) : 51.51;
const lon = lonArg ? Number(lonArg) : -0.13;

/** Map live weather to a Game Master event id from the catalog (see shared/events). */
function toEvent({ temperature, windSpeed, weatherCode }) {
  if (temperature >= 30) return { id: "heatwave", why: `it's ${temperature}°C` };
  if (windSpeed >= 50 || (weatherCode >= 95 && weatherCode <= 99)) return { id: "heatwave", why: `a storm (wind ${windSpeed} km/h)` };
  if (weatherCode >= 61 && weatherCode <= 82) return { id: "bumper_harvest", why: "steady rain — good for the fields" };
  return { id: null, why: "calm weather — no shock today" };
}

async function main() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    console.error(`✗ could not reach Open-Meteo: ${e?.message ?? e}`);
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`✗ Open-Meteo returned HTTP ${res.status}`);
    process.exit(1);
  }
  const json = await res.json();
  const cur = json.current;
  if (!cur || typeof cur.temperature_2m !== "number") {
    console.error("✗ unexpected Open-Meteo response (no current weather)");
    process.exit(1);
  }
  const reading = {
    temperature: cur.temperature_2m,
    windSpeed: cur.wind_speed_10m,
    weatherCode: cur.weather_code,
  };
  const event = toEvent(reading);
  console.log(`location   : ${lat}, ${lon}`);
  console.log(`weather    : ${reading.temperature}°C, wind ${reading.windSpeed} km/h, code ${reading.weatherCode}`);
  console.log(`→ GM event : ${event.id ?? "(none)"} — ${event.why}`);
  console.log("✓ OK — weather feed works with no API key (Open-Meteo). WEATHER_API_KEY can stay empty.");
}

main();
