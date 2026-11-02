# Logic log: checkpoint and rate-limit recovery

The 15-minute polling trigger starts explicit authenticated HTTP request loops. Stargazers are paged at 100 per page, chronologically filtered, and deduplicated by login plus star timestamp. Page and profile progress stays in execution items, not the durable checkpoint.

Each GitHub request has a 10-second timeout and three attempts maximum. Network errors, 429, 5xx and rate-limited 403 responses retry through Wait nodes. Ordinary 4xx errors stop. Header names are case-insensitive: Retry-After accepts seconds or HTTP dates; X-RateLimit-Reset supplies an epoch deadline. Rate-limit fallback waits at least 60 seconds; other transient failures use one/two-second exponential waits. The later applicable deadline wins. A required delay over 300 seconds aborts without advancing state instead of violating the deadline. Successful pagination/profile transitions wait one second. Only validated api.github.com pagination URLs for the same listing path are followed, with a 100-page cap.

The exact qualification is followers > 100 OR public_repos > 50. All profile responses are validated before qualification. An all-nonqualifying batch commits its processed events after enrichment. A mixed batch commits all processed events only after every required Slack response is ok: true. Failed requests, exhausted retries, malformed profiles and missing or failed Slack deliveries do not commit. Partial Slack delivery can cause duplicates on a later retry, and overlapping runs are unsupported.

The separate manual-only demo substitutes an explicitly labelled star event; it must never be presented as a genuine new lead. The production export contains no test pins. See evidence/REVISION_STATUS.md for live verification limits.
