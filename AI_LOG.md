# AI and processing log

Weather lookups use Promise.allSettled with deferred invocation so both synchronous throws and asynchronous failures remain isolated. Only the literal Rain, Snow and Extreme conditions trigger Delayed status and apology generation.

The CLI wires createAiGenerator into processOrders when a provider key is configured. Requests use a system instruction plus the grounded user prompt and read choices[0].message.content. Model and endpoint are configurable; default is gpt-4o-mini with OpenAI chat completions. Missing keys, provider errors, refusal, empty/nontext output or multiple sentences select a deterministic one-sentence fallback. Customer messages are stored only; none are sent.

The test suite verifies both the HTTP provider integration and CLI environment wiring with controlled fixtures. Live weather returned no delaying condition, so there is no claim of a live AI-generated apology in the saved orders.

Each output file is replaced atomically through a unique temporary file and rename; same-process writes are serialized and Windows transient rename failures are bounded. Both files are rendered from the same processed array, without claiming a transactional two-file crash guarantee.

The separately labelled fixture demo uses the real processing function with controlled weather inputs, writes evidence to a separate directory, and checks that live orders.json is unchanged. Its apologies use deterministic fallback; no live AI invocation is claimed.
