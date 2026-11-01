import "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readOrders, renderReport, writeJsonAtomically, writeTextAtomically } from "./storage.js";
import { processOrders } from "./orderProcessor.js";
import { fetchWeather } from "./weather.js";
import { createAiGenerator } from "./ai.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ordersPath = resolve(root, "orders.json");
if (!process.env.OPENWEATHER_API_KEY) throw new Error("OPENWEATHER_API_KEY is missing. Create .env from .env.example or run only the automated fixture tests.");
const orders = await readOrders(ordersPath);
const aiGenerate = createAiGenerator({
  apiKey: process.env.AI_PROVIDER_API_KEY || process.env.OPENAI_API_KEY,
  endpoint: process.env.AI_PROVIDER_URL || undefined,
  model: process.env.AI_PROVIDER_MODEL || "gpt-4o-mini",
});
const processed = await processOrders(orders, { weatherLookup: (city) => fetchWeather(city, { apiKey: process.env.OPENWEATHER_API_KEY }), aiGenerate });
await writeJsonAtomically(ordersPath, processed);
await writeTextAtomically(resolve(root, "order-report.md"), renderReport(processed));
console.log("Processed orders and wrote matching orders.json + order-report.md.");
