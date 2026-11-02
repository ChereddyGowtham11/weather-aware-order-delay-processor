# Test results

36/36 automated tests pass; zero failed, skipped or cancelled. Syntax checks pass.

Regressions cover exact filter boundaries, complete/nonqualifying/mixed batches, incomplete and failed Slack deliveries, failed profile lookups, exported retry controllers, header-aware rate-limit recovery, retry exhaustion, pagination URL safety and the separate manual-only demo. Full outputs: evidence/test-output.txt and evidence/syntax-checks.txt.

Live verification status: evidence/REVISION_STATUS.md.

The additional sandbox regression runs the exported pagination controller without URL globals, matching n8n. A real n8n no-network runtime check confirmed valid pagination and a Retry-After=90 response producing waitSeconds=90.
