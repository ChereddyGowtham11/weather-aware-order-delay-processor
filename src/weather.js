const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const delayConditions = new Set(["Rain", "Snow", "Extreme"]);

export class WeatherError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function isDelayWeather(main) { return delayConditions.has(String(main ?? "").trim()); }

export function normalizeWeather(payload) {
  const main = payload?.weather?.[0]?.main;
  const description = payload?.weather?.[0]?.description;
  if (typeof main !== "string" || !main.trim()) throw new WeatherError("Weather response is missing weather[0].main");
  return { main: main.trim(), description: typeof description === "string" ? description.trim() : null };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(header, attempt, now) {
  let delay = 200 * (2 ** attempt);
  if (typeof header === "string" && header.trim()) {
    const seconds = Number(header);
    const date = Date.parse(header);
    if (Number.isFinite(seconds)) {
      if (seconds >= 0) delay = seconds * 1000;
    } else if (Number.isFinite(date)) delay = Math.max(0, date - now());
  }
  return Math.min(30000, delay);
}

export async function fetchWeather(city, { apiKey, fetchImpl = fetch, retries = 2, timeoutMs = 8000, sleepImpl = wait, now = Date.now } = {}) {
  if (!apiKey) throw new WeatherError("OPENWEATHER_API_KEY is required for live weather requests");
  if (typeof city !== "string" || !city.trim()) throw new WeatherError("A nonempty city is required");
  if (!Number.isInteger(retries) || retries < 0 || retries > 10) throw new WeatherError("Weather retry count must be an integer from 0 to 10");
  const url = new URL(WEATHER_URL);
  url.search = new URLSearchParams({ q: city.trim(), appid: apiKey, units: "metric" });
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let retryAfter;
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) {
        retryAfter = response.headers?.get?.("retry-after");
        throw new WeatherError(`OpenWeatherMap request failed for ${city} (${response.status})`, response.status);
      }
      let payload;
      try { payload = await response.json(); } catch (error) {
        if (error.name === "AbortError") throw error;
        throw new WeatherError("Weather response was not valid JSON");
      }
      return normalizeWeather(payload);
    } catch (error) {
      lastError = error.name === "AbortError" ? new WeatherError(`Weather request timed out for ${city}`) : error;
      const retryable = error.name === "AbortError" || !(error instanceof WeatherError) || error.status === 429 || error.status >= 500;
      if (attempt === retries || !retryable) throw lastError;
    } finally { clearTimeout(timer); }
    await sleepImpl(retryDelay(retryAfter, attempt, now));
  }
  throw lastError;
}
