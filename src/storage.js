import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const writeQueues = new Map();

export async function readOrders(path) {
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 4) throw new Error("orders.json must contain the supplied four orders");
  const ids = new Set();
  for (const order of parsed) {
    if (!order || !["string", "number"].includes(typeof order.order_id) || !String(order.order_id).trim() || typeof order.order_id === "number" && !Number.isFinite(order.order_id)) throw new Error("Each order needs a valid order_id");
    for (const field of ["customer", "city", "status"]) if (typeof order[field] !== "string" || !order[field].trim()) throw new Error(`Each order needs a nonempty ${field}`);
    const id = String(order.order_id);
    if (ids.has(id)) throw new Error("Order IDs must be unique");
    ids.add(id);
  }
  return parsed;
}

export async function writeJsonAtomically(path, data) {
  await writeTextAtomically(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeTextAtomically(path, text) {
  const target = path instanceof URL ? fileURLToPath(path) : resolve(path);
  const key = process.platform === "win32" ? target.toLowerCase() : target;
  const previous = writeQueues.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(() => commitText(target, text));
  writeQueues.set(key, operation);
  try { await operation; } finally {
    if (writeQueues.get(key) === operation) writeQueues.delete(key);
  }
}

async function commitText(path, text) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, text, { encoding: "utf8", flag: "wx" });
    for (let attempt = 0; ; attempt++) {
      try { await rename(tmp, path); break; } catch (error) {
        if (process.platform !== "win32" || !["EPERM", "EBUSY", "EACCES"].includes(error.code) || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
  } finally {
    await rm(tmp, { force: true });
  }
}

export function renderReport(orders) {
  const lines = ["# Weather-aware order processing report", "", "Generated directly from saved `orders.json`.", ""];
  const cell = value => String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  for (const order of orders) lines.push(`- ${cell(order.order_id)} | ${cell(order.city)} | **${cell(order.status)}** | weather: ${cell(order.weather_error ? "lookup failed/not checked" : order.weather?.main ?? "lookup failed/not checked")} | ${cell(order.weather_error ?? order.delay_reason ?? "no delay")}`);
  return `${lines.join("\n")}\n`;
}
