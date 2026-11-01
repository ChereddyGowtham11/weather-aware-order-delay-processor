# Assignment 2 verification

- Runtime: v22.14.0.
- npm.cmd test: 44 passed, 0 failed, 0 skipped, 0 cancelled.
- npm.cmd run lint: passed.
- Exact output: evidence/test-output.txt and evidence/syntax-checks.txt.
- Live CLI: exit 0; three valid cities returned weather; InvalidCity123 returned expected HTTP 404 without cancelling valid orders.
- Output verification: orders.json matches order-report.md exactly through the supplied renderer.
- Evidence: genuine screenshot and recording of the actual CLI run through a local capture helper.
- AI integration: configured HTTP client and CLI wiring tested with controlled responses. A real AI-provider apology was not exercised during the clear/non-delaying live weather run.

Regression coverage includes all literal delay conditions, concurrency, synchronous failure isolation, malformed weather, reruns, input immutability, AI authentication/response validation/refusals/timeouts/fallback, 401/403/404 non-retries, 429 and server retries, retry budgets and Retry-After formats, invalid orders, concurrent atomic writes, persistence failure cleanup, Markdown escaping and full CLI-to-report consistency.
