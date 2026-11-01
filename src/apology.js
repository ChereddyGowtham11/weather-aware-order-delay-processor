export function buildApologyPrompt({ customer, city, weather }) {
  return `Write exactly one professional customer apology sentence. Verified data: customer=${JSON.stringify(customer)}, city=${JSON.stringify(city)}, weather_main=${JSON.stringify(weather.main)}, weather_description=${JSON.stringify(weather.description ?? "")}. State only that the order is delayed due to this verified weather. Do not add claims, compensation, or delivery dates.`;
}

export function fallbackApology({ customer, city, weather }) {
  const cause = weather.description || weather.main.toLowerCase();
  return `Hi ${customer}, your order to ${city} is delayed due to ${cause}; we appreciate your patience!`;
}

export async function createApology(order, weather, { aiGenerate } = {}) {
  if (!aiGenerate) return { message: fallbackApology({ ...order, weather }), source: "deterministic_fallback" };
  try {
    const generated = await aiGenerate(buildApologyPrompt({ ...order, weather }));
    if (typeof generated !== "string") throw new Error("AI output was not text");
    const message = generated.trim();
    if (!message || message.split(/[.!?]/).filter(Boolean).length > 1) throw new Error("AI output was empty or not one sentence");
    return { message, source: "ai" };
  } catch { return { message: fallbackApology({ ...order, weather }), source: "deterministic_fallback" }; }
}
