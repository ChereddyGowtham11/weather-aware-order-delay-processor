import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createAiGenerator } from "../src/ai.js";
import { createApology } from "../src/apology.js";
import { processOrders } from "../src/orderProcessor.js";
import { readOrders, renderReport, writeJsonAtomically, writeTextAtomically } from "../src/storage.js";
import { fetchWeather } from "../src/weather.js";

const orders = ["New York", "Mumbai", "London", "InvalidCity123"].map((city, index) => ({ order_id: String(1001 + index), customer: ["Alice Smith", "Bob Jones", "Charlie Green", "InvalidCity123"][index], city, status: "Pending" }));
const response = (main = "Clouds") => new Response(JSON.stringify({ weather: [{ main, description: main.toLowerCase() }] }));
async function temporary(t) {
  const prefix = join(tmpdir(), "assignment-2-test-");
  const directory = await mkdtemp(prefix);
  if (!directory.startsWith(prefix)) throw new Error("Unexpected temporary directory");
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("a synchronous city failure cannot cancel the other lookups", async () => {
  const called = [];
  const result = await processOrders(orders, { weatherLookup: city => {
    called.push(city);
    if (city === "Mumbai") throw new Error("synchronous lookup failure");
    return { main: "Rain" };
  } });
  assert.deepEqual(called, orders.map(order => order.city));
  assert.match(result[1].weather_error, /synchronous/);
  assert.equal(result[1].status, "Pending");
  assert.equal(result[0].status, "Delayed");
  assert.equal(result[2].status, "Delayed");
});

for (const invalid of [null, {}, { main: "" }, { main: 42 }]) {
  test(`malformed normalized weather is isolated: ${JSON.stringify(invalid)}`, async () => {
    const result = await processOrders(orders, { weatherLookup: city => city === "London" ? invalid : { main: "Clouds" } });
    assert.match(result[2].weather_error, /invalid condition/);
    assert.equal(result[0].weather.main, "Clouds");
    assert.equal(result.length, 4);
  });
}

test("failed reruns preserve business status, clear stale weather and never mutate input", async () => {
  const input = orders.map(order => ({ ...order, status: "Delayed", weather: { main: "Rain" } }));
  const before = structuredClone(input);
  const result = await processOrders(input, { weatherLookup: () => Promise.reject(new Error("offline")) });
  assert.deepEqual(input, before);
  for (const order of result) {
    assert.equal(order.status, "Delayed");
    assert.equal(Object.hasOwn(order, "weather"), false);
    assert.equal(order.weather_error, "offline");
  }
});

test("every literal delay category triggers AI while clear weather preserves status", async () => {
  const conditions = ["Rain", "Snow", "Extreme", "Clouds"];
  const prompts = [];
  const result = await processOrders(orders, {
    weatherLookup: city => ({ main: conditions[orders.findIndex(order => order.city === city)] }),
    aiGenerate: async prompt => { prompts.push(prompt); return "Your order is delayed due to the verified weather."; },
  });
  assert.deepEqual(result.map(order => order.status), ["Delayed", "Delayed", "Delayed", "Pending"]);
  assert.equal(prompts.length, 3);
  assert.ok(result.slice(0, 3).every(order => order.apology_source === "ai"));
  assert.equal(result[3].apology_message, undefined);
});

test("the configured AI HTTP client is used by delayed-order processing", async () => {
  let requests = 0;
  const aiGenerate = createAiGenerator({ apiKey: "fixture-key", fetchImpl: async (url, options) => {
    requests++;
    assert.equal(url.href, "https://api.openai.com/v1/chat/completions");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer fixture-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-4o-mini");
    assert.match(body.messages[1].content, /Alice Smith/);
    assert.match(body.messages[1].content, /New York/);
    assert.match(body.messages[1].content, /Rain/);
    return new Response(JSON.stringify({ choices: [{ message: { content: "Hi Alice Smith, your order to New York is delayed due to rain." } }] }));
  } });
  const result = await processOrders(orders, { weatherLookup: city => ({ main: city === "New York" ? "Rain" : "Clouds" }), aiGenerate });
  assert.equal(requests, 1);
  assert.equal(result[0].apology_source, "ai");
  assert.match(result[0].apology_message, /Alice Smith/);
});

test("no provider key selects the deterministic fallback without a request", () => {
  assert.equal(createAiGenerator(), undefined);
  assert.equal(createAiGenerator({ apiKey: "   " }), undefined);
});

for (const payload of [{}, { choices: [] }, { choices: [{ message: { content: 42 } }] }, { choices: [{ message: { content: "" } }] }, { choices: [{ message: { refusal: "refused", content: "No." } }] }]) {
  test(`unusable provider output falls back safely: ${JSON.stringify(payload)}`, async () => {
    const aiGenerate = createAiGenerator({ apiKey: "fixture-key", fetchImpl: async () => new Response(JSON.stringify(payload)) });
    const apology = await createApology(orders[0], { main: "Rain", description: "heavy rain" }, { aiGenerate });
    assert.equal(apology.source, "deterministic_fallback");
    assert.match(apology.message, /heavy rain/);
  });
}

test("HTTP AI failure and timeout both fall back without leaking the key", async () => {
  const denied = createAiGenerator({ apiKey: "fixture-key", fetchImpl: async () => new Response("denied", { status: 401 }) });
  assert.equal((await createApology(orders[0], { main: "Snow" }, { aiGenerate: denied })).source, "deterministic_fallback");
  const timedOut = createAiGenerator({ apiKey: "fixture-key", timeoutMs: 5, fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true })) });
  assert.equal((await createApology(orders[0], { main: "Snow" }, { aiGenerate: timedOut })).source, "deterministic_fallback");
  await assert.rejects(() => denied("test"), error => /401/.test(error.message) && !error.message.includes("fixture-key"));
});

test("nontext and multiple-sentence AI responses are rejected", async () => {
  for (const value of [null, undefined, 42, "", "First sentence. Second sentence."]) {
    const result = await createApology(orders[0], { main: "Rain" }, { aiGenerate: async () => value });
    assert.equal(result.source, "deterministic_fallback");
  }
});

test("AI credentials are not sent to an insecure remote endpoint", () => {
  assert.throws(() => createAiGenerator({ apiKey: "fixture-key", endpoint: "http://example.com/chat" }), /HTTPS/);
});

for (const status of [401, 403, 404]) {
  test(`weather HTTP ${status} fails once without retrying`, async () => {
    let calls = 0;
    await assert.rejects(() => fetchWeather("London", { apiKey: "fixture-key", fetchImpl: async () => { calls++; return new Response("{}", { status }); }, sleepImpl: async () => assert.fail("Unexpected retry") }), new RegExp(String(status)));
    assert.equal(calls, 1);
  });
}

test("network and server failures retry within a fixed budget using exponential delays", async () => {
  let calls = 0;
  const delays = [];
  const result = await fetchWeather("New York", { apiKey: "fixture-key", sleepImpl: async ms => delays.push(ms), fetchImpl: async url => {
    assert.equal(url.searchParams.get("q"), "New York");
    assert.equal(url.searchParams.get("units"), "metric");
    calls++;
    if (calls === 1) throw new TypeError("network unavailable");
    if (calls === 2) return new Response("{}", { status: 503 });
    return response("Rain");
  } });
  assert.equal(result.main, "Rain");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [200, 400]);
});

for (const [header, expected] of [["3", 3000], ["Sun, 01 Nov 2026 00:00:02 GMT", 2000], ["999999", 30000], ["", 200], ["-1", 200], ["invalid", 200], ["0", 0]]) {
  test(`429 respects bounded Retry-After: ${JSON.stringify(header)}`, async () => {
    let calls = 0;
    const delays = [];
    await fetchWeather("London", { apiKey: "fixture-key", now: () => Date.parse("2026-11-01T00:00:00Z"), sleepImpl: async ms => delays.push(ms), fetchImpl: async () => ++calls === 1 ? new Response("{}", { status: 429, headers: { "Retry-After": header } }) : response() });
    assert.deepEqual(delays, [expected]);
    assert.equal(calls, 2);
  });
}

test("persistent failure exhausts exactly the configured number of attempts", async () => {
  let calls = 0;
  await assert.rejects(() => fetchWeather("London", { apiKey: "fixture-key", sleepImpl: async () => {}, fetchImpl: async () => { calls++; return new Response("{}", { status: 500 }); } }), /500/);
  assert.equal(calls, 3);
});

test("weather timeouts retry and eventually fail with a clear timeout message", async () => {
  let calls = 0;
  await assert.rejects(() => fetchWeather("London", { apiKey: "fixture-key", timeoutMs: 5, retries: 1, sleepImpl: async () => {}, fetchImpl: async (url, { signal }) => {
    calls++;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true }));
  } }), /timed out/);
  assert.equal(calls, 2);
});

for (const body of ["not JSON", JSON.stringify({ weather: [] })]) {
  test(`malformed weather payload is not retried: ${body}`, async () => {
    let calls = 0;
    await assert.rejects(() => fetchWeather("London", { apiKey: "fixture-key", fetchImpl: async () => { calls++; return new Response(body); } }), /valid JSON|missing/);
    assert.equal(calls, 1);
  });
}

test("weather rejects missing key, empty city and an unbounded retry configuration", async () => {
  await assert.rejects(() => fetchWeather("London"), /API_KEY/);
  await assert.rejects(() => fetchWeather("", { apiKey: "fixture-key" }), /city/);
  await assert.rejects(() => fetchWeather("London", { apiKey: "fixture-key", retries: Infinity }), /retry count/);
});

test("input validation rejects malformed orders and duplicate identities", async t => {
  const directory = await temporary(t);
  const path = join(directory, "orders.json");
  await writeFile(path, JSON.stringify(orders));
  assert.deepEqual(await readOrders(path), orders);
  for (const bad of [orders.slice(0, 3), [null, ...orders.slice(1)], orders.map((order, i) => i === 1 ? { ...order, city: "" } : order), orders.map(order => ({ ...order, order_id: "duplicate" }))]) {
    await writeFile(path, JSON.stringify(bad));
    await assert.rejects(() => readOrders(path), /four orders|order_id|city|unique/);
  }
});

test("concurrent atomic writes produce valid output without temporary-file collisions", async t => {
  const directory = await temporary(t);
  const path = join(directory, "orders.json");
  await Promise.all(Array.from({ length: 4 }, (_, index) => writeJsonAtomically(path, { index })));
  const result = JSON.parse(await readFile(path, "utf8"));
  assert.ok([0, 1, 2, 3].includes(result.index));
  assert.deepEqual(await readdir(directory), ["orders.json"]);
});

test("failed persistence preserves existing data and cleans temporary files", async t => {
  const directory = await temporary(t);
  const file = join(directory, "orders.json");
  await writeJsonAtomically(file, orders);
  await assert.rejects(() => writeJsonAtomically(file, { invalid: 1n }));
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), orders);
  const target = join(directory, "directory-target");
  await mkdir(target);
  await assert.rejects(() => writeTextAtomically(target, "cannot replace a directory"));
  assert.deepEqual((await readdir(directory)).sort(), ["directory-target", "orders.json"]);
});

test("report output escapes table delimiters and never presents stale weather as fresh", () => {
  const report = renderReport([{ ...orders[0], city: "A|B\nC", weather: { main: "Rain" }, weather_error: "offline" }]);
  assert.match(report, /A\\\|B C/);
  assert.match(report, /weather: lookup failed\/not checked \| offline/);
  assert.doesNotMatch(report, /weather: Rain/);
});

test("CLI wiring writes matching orders and report with the configured AI provider", async t => {
  const directory = await temporary(t);
  await cp(new URL("../src/", import.meta.url), join(directory, "src"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ type: "module" }));
  await writeFile(join(directory, "orders.json"), JSON.stringify(orders));
  const loader = `globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'api.openweathermap.org') {
      const city = parsed.searchParams.get('q');
      if (city === 'InvalidCity123') return new Response('{}', {status:404});
      return new Response(JSON.stringify({weather:[{main:city === 'New York' ? 'Rain' : 'Clouds',description:'verified fixture weather'}]}));
    }
    if (parsed.hostname === 'api.openai.com') return new Response(JSON.stringify({choices:[{message:{content:'Hi Alice Smith, your order to New York is delayed due to rain.'}}]}));
    throw new Error('Unexpected network request in fixture test');
  };`;
  await writeFile(join(directory, "fixture-loader.mjs"), loader);
  const { stdout } = await promisify(execFile)(process.execPath, ["--import", pathToFileURL(join(directory, "fixture-loader.mjs")).href, "src/index.js"], {
    cwd: directory,
    env: { ...process.env, OPENWEATHER_API_KEY: "fixture-weather-key", AI_PROVIDER_API_KEY: "fixture-ai-key", AI_PROVIDER_URL: "https://api.openai.com/v1/chat/completions", AI_PROVIDER_MODEL: "gpt-4o-mini" },
  });
  assert.match(stdout, /Processed orders/);
  const saved = JSON.parse(await readFile(join(directory, "orders.json"), "utf8"));
  assert.equal(saved[0].status, "Delayed");
  assert.equal(saved[0].apology_source, "ai");
  assert.match(saved[3].weather_error, /404/);
  assert.equal(await readFile(join(directory, "order-report.md"), "utf8"), renderReport(saved));
});
