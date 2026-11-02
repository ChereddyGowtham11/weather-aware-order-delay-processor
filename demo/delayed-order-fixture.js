import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { processOrders } from '../src/orderProcessor.js';
import { writeJsonAtomically, writeTextAtomically, renderReport } from '../src/storage.js';

export async function runFixtureDemo(output = new URL('../evidence/delayed-order-fixture/', import.meta.url)) {
  const live = new URL('../orders.json', import.meta.url);
  const before = await readFile(live);
  const orders = JSON.parse(before).map(({ order_id, customer, city }) => ({ order_id, customer, city, status: 'Pending' }));
  const conditions = new Map([['New York', { main: 'Rain', description: 'simulated moderate rain' }], ['Mumbai', { main: 'Snow', description: 'simulated snow' }], ['London', { main: 'Clouds', description: 'simulated cloudy weather' }]]);
  const result = await processOrders(orders, {
    weatherLookup: async city => {
      if (!conditions.has(city)) throw new Error('SIMULATED invalid city (404)');
      return conditions.get(city);
    },
    now: () => '2026-11-02T00:00:00.000Z',
  });
  const evidence = { simulated: true, weather_source: 'Controlled local fixtures; no live weather requests', apology_source: 'deterministic_fallback; no live AI provider invoked', orders: result };
  await mkdir(output, { recursive: true });
  const dir = output instanceof URL ? fileURLToPath(output) : output;
  await writeJsonAtomically(resolve(dir, 'simulated-orders.json'), evidence);
  await writeTextAtomically(resolve(dir, 'simulated-report.md'), '# SIMULATED WEATHER DEMONSTRATION\n\nFixture-only results; live orders.json is unchanged. Apologies use the deterministic fallback.\n\n' + renderReport(result));
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = result.map(o => `<tr><td>${esc(o.order_id)}<br>${esc(o.city)}</td><td>${esc(o.weather?.main || 'Lookup failed')}</td><td>${esc(o.status)}</td><td>${esc(o.apology_message || o.weather_error || 'No apology required')}</td></tr>`).join('');
  await writeTextAtomically(resolve(dir, 'demonstration.html'), `<!doctype html><meta charset="utf-8"><title>SIMULATED weather demonstration</title><style>body{font:20px system-ui;margin:40px;background:#f5f7fb;color:#17253c}h1{color:#964000}p{line-height:1.6}table{border-collapse:collapse;background:white;width:100%;font-size:18px}td,th{padding:18px;border:1px solid #ccd5e0;text-align:left}footer{margin-top:24px}</style><h1>TEST ONLY — SIMULATED WEATHER</h1><p>Actual processOrders() with controlled weather fixtures.<br>No live weather or AI requests. Apologies use the deterministic fallback.<br>The genuine live orders.json is unchanged.</p><table><tr><th>Order / city</th><th>Fixture condition</th><th>Result</th><th>Apology / isolated error</th></tr>${rows}</table><footer>Reproduce: npm run demo:fixture · Separate outputs: evidence/delayed-order-fixture/</footer>`);
  if (!(await readFile(live)).equals(before)) throw new Error('Live orders unexpectedly changed');
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runFixtureDemo(), null, 2));
}
