# Current submission answers

Both assignments: 81 included tests pass; final n8n correction confirmed Published.

## Assignment 1

ASSIGNMENT 1 - CURRENT FORM ANSWERS

Workflow JSON File
Upload github-lead-sniper.json if raw JSON is accepted. If the form only accepts PDF/documents, upload workflow-json-for-form.docx, which contains the exact same JSON.

Slack / Discord Success Screenshot
Upload slack-success-screenshot.png. This genuine capture shows Slack API ok:true for the complete controlled end-to-end test. The star event and notification are explicitly labelled simulated; enrichment, AI generation and Slack delivery were real.

Demo video link
https://github.com/ChereddyGowtham11/weather-aware-order-delay-processor/blob/main/assignment-1/evidence/assignment-1-current-demo.mp4

Video description: 38-second evidence walkthrough from genuine captures, with final publication confirmation. It is not a continuous recording or a genuine new-lead claim.

Logic Log: GitHub API Rate Limit Handling
The workflow polls every 15 minutes, requests 100 stargazers per page, and waits one second between successful page/profile requests. Each GitHub request has a 10-second timeout and at most three attempts. Native Loop Over Items, response controllers and Wait nodes retry network errors, HTTP 429, 5xx, and rate-limited 403 responses. Ordinary permission/authentication errors stop immediately. Retry-After seconds or HTTP dates and X-RateLimit-Reset epoch deadlines are respected case-insensitively; the later applicable deadline wins. Rate-limit fallback waits 60 then 120 seconds; other transient failures use one/two-second backoff. If the required delay exceeds 300 seconds, execution stops rather than retrying early. All successfully processed star events, including nonqualifying users, commit only after every profile lookup and every required Slack delivery succeeds. Failed or incomplete batches never advance the checkpoint. Partial Slack deliveries can cause duplicate notifications on retry; run one execution at a time.

Current verification
36 Assignment 1 tests pass. The final n8n correction is confirmed Published. The read-only permission test returned 403; previously approved Contents read/write remains restricted to ServiceGpt. No GitHub write requests are made by the workflow.

## Assignment 2

ASSIGNMENT 2 - CURRENT FORM ANSWERS

Public GitHub Repository Link
https://github.com/ChereddyGowtham11/weather-aware-order-delay-processor

Updated orders.json File
Upload orders.json if raw JSON is accepted. If only PDF/documents are accepted, upload updated-orders-for-form.docx. Both contain the genuine unchanged live order data; simulated results are separate.

Demo video link
https://github.com/ChereddyGowtham11/weather-aware-order-delay-processor/blob/main/evidence/assignment-2-current-demo.mp4

Video description: about 46 seconds; genuine live CLI recording followed by a clearly labelled fixture demonstration showing delayed orders and fallback apologies. No live AI weather apology is claimed.

AI Log: Parallel Fetching & Error Handling
Prompt summaries reconstructed from the AI-assisted implementation and test work (not a verbatim conversation transcript):
1. Fetch weather for all four orders concurrently using Promise.allSettled, with deferred invocation so synchronous throws and asynchronous failures are isolated.
2. Preserve a failed order's status and record weather_error without stopping other orders. Mark only Rain, Snow, and Extreme conditions Delayed; clear stale weather and lookup errors appropriately on reruns.
3. Add an 8-second request timeout and at most two retries for network failures, timeouts, HTTP 429, and 5xx. Respect Retry-After with a 30-second cap; do not retry invalid-city 404 responses.
4. Generate a grounded one-sentence apology for delayed orders, with a deterministic fallback for missing credentials, provider errors, or invalid responses.
5. Verify concurrency, partial failures, retry limits, reruns, AI integration, atomic per-file persistence, and matching JSON/Markdown outputs. Add a separately labelled Rain/Snow demonstration and confirm the genuine live orders.json is unchanged. All 45 included tests pass.
