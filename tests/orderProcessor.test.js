import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApologyPrompt, createApology, fallbackApology } from "../src/apology.js";
import { processOrders } from "../src/orderProcessor.js";
import { writeJsonAtomically } from "../src/storage.js";
import { fetchWeather, isDelayWeather, normalizeWeather } from "../src/weather.js";

const orders = [
  { order_id: "1001", customer: "Alice Smith", city: "New York", status: "Pending" },
  { order_id: "1002", customer: "Bob Jones", city: "Mumbai", status: "Pending" },
  { order_id: "1003", customer: "Charlie Green", city: "London", status: "Pending" },
  { order_id: "1004", customer: "InvalidCity123", city: "InvalidCity123", status: "Pending" },
];

test("literal delay classification accepts only Rain, Snow, and Extreme", () => {
  assert.equal(isDelayWeather("Rain"), true); assert.equal(isDelayWeather("Snow"), true); assert.equal(isDelayWeather("Extreme"), true); assert.equal(isDelayWeather("Thunderstorm"), false);
});

test("all weather lookups overlap and an invalid city does not cancel valid orders", async () => {
  let active = 0; let maxActive = 0;
  const weatherLookup = async (city) => { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 15)); active--; if (city === "InvalidCity123") throw new Error("404 city not found"); return { main: city === "Mumbai" ? "Rain" : "Clear", description: "clear sky" }; };
  const done = await processOrders(orders, { weatherLookup, now: () => "2026-01-01T00:00:00.000Z" });
  assert.equal(maxActive, 4); assert.equal(done[1].status, "Delayed"); assert.equal(done[0].status, "Pending"); assert.match(done[3].weather_error, /404/);
});

test("malformed weather response is rejected", () => assert.throws(() => normalizeWeather({ weather: [] }), /missing/));
test("successful retry clears a previous weather error for clear and delayed orders", async () => {
  const failed = orders.slice(0, 2).map(order => ({ ...order, weather_error: "previous 401" }));
  const done = await processOrders(failed, { weatherLookup: async city => ({ main: city === "Mumbai" ? "Rain" : "Clouds" }) });
  for (const order of done) assert.equal(Object.hasOwn(order, "weather_error"), false);
  assert.equal(done[0].status, "Pending");
  assert.equal(done[1].status, "Delayed");
  assert.equal(failed[0].weather_error, "previous 401");
});
test("AI prompt is grounded and failure falls back deterministically", async () => {
  const weather = { main: "Rain", description: "heavy rain" }; const prompt = buildApologyPrompt({ ...orders[1], weather });
  assert.match(prompt, /Bob Jones/); assert.match(prompt, /heavy rain/);
  const result = await createApology(orders[1], weather, { aiGenerate: async () => { throw new Error("offline"); } });
  assert.equal(result.source, "deterministic_fallback"); assert.equal(result.message, fallbackApology({ ...orders[1], weather }));
});

test("weather client handles HTTP errors and atomic storage writes valid JSON", async () => {
  await assert.rejects(() => fetchWeather("InvalidCity123", { apiKey: "test", retries: 0, fetchImpl: async () => new Response("{}", { status: 404 }) }), /404/);
  const dir = await mkdtemp(join(tmpdir(), "orders-")); const path = join(dir, "orders.json"); await writeJsonAtomically(path, orders); assert.deepEqual(JSON.parse(await readFile(path, "utf8")), orders);
});
