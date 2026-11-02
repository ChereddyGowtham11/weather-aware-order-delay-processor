# Assignment 2 - Weather-Aware Order Delay Processor

Processes the supplied four orders concurrently with live OpenWeatherMap data, isolates failed city lookups, marks Rain/Snow/Extreme orders Delayed, and writes matching orders.json and order-report.md.

## Run

Requires Node.js 20.6+; no dependencies need installation.

1. Copy .env.example to .env and set OPENWEATHER_API_KEY.
2. Run npm test, then npm run lint.
3. Run npm start. The command loads .env automatically; existing shell variables take precedence.

On Windows PowerShell, use npm.cmd when execution policy blocks npm.ps1. Real credentials are excluded from the submission archives.

## Optional AI provider

Set AI_PROVIDER_API_KEY to enable the HTTP AI client. AI_PROVIDER_URL defaults to https://api.openai.com/v1/chat/completions, and AI_PROVIDER_MODEL defaults to gpt-4o-mini. OPENAI_API_KEY is also accepted as a key fallback. A custom URL must implement the OpenAI-compatible messages/choices chat-completions shape and use HTTPS, except for local HTTP providers.

The provider receives only verified customer, city and weather fields. Requests have an 8-second timeout and a bounded output size. Empty, malformed, refused, failed or multiple-sentence responses use a deterministic one-sentence fallback. No messages are sent to customers.

Provider API shape reference: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create

## Reliability

Weather requests start together and use an 8-second timeout with at most two retries for network errors, timeouts, HTTP 429 and 5xx. Retry-After seconds and HTTP dates are respected with a maximum 30-second delay. Other 4xx and malformed successful payloads are not retried.

Synchronous and asynchronous lookup failures are isolated. Failed orders retain their business status, record weather_error and do not display stale weather as fresh. Successful reruns clear earlier lookup errors. Processing does not mutate the input array.

Input validation requires the supplied four orders, unique IDs and nonempty customer/city/status fields. JSON and Markdown are each written with an atomic temporary-file rename; same-process writes to the same file are serialized. The two files are generated from the same processed data, but they are not a crash-atomic two-file transaction.

## Verification and demonstration

- 45/45 automated tests pass with zero failures; syntax checks pass on v22.14.0.
- The real weather run returned Clouds for New York, Mumbai and London, preserving Pending status.
- InvalidCity123 returned the expected isolated HTTP 404; the command still completed successfully.
- Current conditions required no apology. The automated suite exercises Rain, Snow and Extreme, configured AI client wiring, provider failures, timeout/retry limits, malformed input, persistence and full CLI output consistency using clearly controlled fixtures.

See evidence/test-output.txt, evidence/syntax-checks.txt, live-cli-run.png, live-order-report.png and assignment-2-demo.webm. The recording uses a localhost capture helper that executes the actual supplied CLI against live weather; its output and report are shown directly. AI HTTP tests are fixtures, not live provider evidence.

## Separate delayed-order fixture demonstration

Run `npm run demo:fixture` (or `npm.cmd run demo:fixture` in Windows PowerShell). The real processOrders function consumes explicitly simulated Rain, Snow, Clouds and invalid-city responses. Outputs go only to evidence/delayed-order-fixture/: simulated-orders.json, simulated-report.md and demonstration.html. A screenshot and a 12-second still-image evidence walkthrough show the actual fixture results. Rain and Snow produce Delayed orders with deterministic fallback apologies. This is not live weather or live AI evidence. The genuine orders.json remains unchanged, verified by a regression test.
