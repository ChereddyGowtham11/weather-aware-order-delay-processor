import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFixtureDemo } from '../demo/delayed-order-fixture.js';

test('fixture demonstration produces delayed apologies separately and preserves live orders', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'weather-fixture-'));
  const live = new URL('../orders.json', import.meta.url);
  const before = await readFile(live);
  try {
    const output = await runFixtureDemo(dir);
    assert.equal(output.simulated, true);
    const delayed = output.orders.filter(o => o.status === 'Delayed');
    assert.equal(delayed.length, 2);
    for (const order of delayed) {
      assert.ok(order.apology_message);
      assert.equal(order.apology_source, 'deterministic_fallback');
    }
    assert.equal(output.orders[2].status, 'Pending');
    assert.match(output.orders[3].weather_error, /SIMULATED/);
    assert.deepEqual(await readFile(live), before);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'simulated-orders.json'), 'utf8')), output);
    assert.match(await readFile(join(dir, 'demonstration.html'), 'utf8'), /SIMULATED WEATHER/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
