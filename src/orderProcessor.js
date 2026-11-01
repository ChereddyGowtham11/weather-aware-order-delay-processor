import { createApology } from "./apology.js";
import { isDelayWeather } from "./weather.js";

export async function processOrders(orders, { weatherLookup, aiGenerate, now = () => new Date().toISOString() }) {
  const outcomes = await Promise.allSettled(orders.map((order) => Promise.resolve().then(() => weatherLookup(order.city)).then((weather) => {
    if (typeof weather?.main !== "string" || !weather.main.trim()) throw new Error("Weather lookup returned an invalid condition");
    return { main: weather.main.trim(), description: typeof weather.description === "string" ? weather.description.trim() : null };
  })));
  return Promise.all(orders.map(async (order, index) => {
    const checked = now(); const outcome = outcomes[index];
    order = { ...order };
    if (outcome.status === "rejected") {
      delete order.weather;
      return { ...order, weather_error: String(outcome.reason?.message || outcome.reason), last_checked_at: checked };
    }
    delete order.weather_error;
    const weather = outcome.value;
    if (!isDelayWeather(weather.main)) return { ...order, weather, last_checked_at: checked };
    const apology = await createApology(order, weather, { aiGenerate });
    return { ...order, status: "Delayed", weather, delay_reason: `Verified weather condition: ${weather.main}`, apology_message: apology.message, apology_source: apology.source, last_checked_at: checked };
  }));
}
