# Assignment 1 - GitHub High-Value Lead Sniper

The n8n workflow monitors actual GitHub stars, enriches new stargazers, qualifies followers > 100 OR public_repos > 50, generates a one-sentence observation and sends a Slack notification.

## Verified results

- 36/36 automated tests passed, zero failures; syntax checks passed on v22.14.0.
- Live Stargazers request for ChereddyGowtham11/ServiceGpt returned HTTP 200 with zero stars.
- The revised production graph returned HTTP 200 and an empty star list through its new request controller. The existing checkpoint remained 2026-11-01T19:35:33.973Z.
- An isolated gpt-4o-mini connection test returned OK using n8n gateway credits (execution 18).
- A complete controlled star-to-Slack run succeeded in the separate test workflow: live octocat profile enrichment, exact qualification, actual gpt-4o-mini pitch, real Slack delivery and final commit with processed=1, notified=1, simulated=true. The star event was simulated; it is not a genuine new lead.
- The final 21-node workflow, including the sandbox-safe pagination correction, is confirmed Published with its 15-minute schedule. Version label: Final verified checkpoint and retry recovery. See evidence/final-workflow-published.png.

Workspace workflow: https://gowtham2911.app.n8n.cloud/workflow/eAWPPlJ4AmZFGYZy

## Import and configuration

1. Import github-lead-sniper.json into n8n. The portable export is inactive; configure credentials before publishing it in another instance.
2. Create an HTTP Header Auth credential named GitHub token (Bearer): header name Authorization, value Bearer YOUR_GITHUB_TOKEN. Select it in both GitHub HTTP nodes.
3. Create an HTTP Header Auth credential named Slack bot token (Bearer): header name Authorization, value Bearer YOUR_SLACK_BOT_TOKEN. Select it in Send Slack notification.
4. Use slack-app-manifest.json to create a bot with chat:write, install it to your workspace, and invite it to the destination channel.
5. Edit Repository and channel configuration for your repository and channel. The supplied demo values reference the owner's ServiceGpt repository and private demo channel.
6. In Connected chat model, explicitly select Gateway credits on n8n Cloud, or configure an OpenAI API credential for another instance. The model is gpt-4o-mini.

No actual token or webhook secret is included. The .env.example file is reference documentation; Cloud configuration is held in the configuration node and n8n credentials.

The workflow performs GitHub GET requests only. The dedicated fine-grained token is restricted to ServiceGpt and expires on 1 December 2026. During this review, Contents was reduced to read-only while Metadata remained read-only. The real authenticated Stargazers request then returned HTTP 403. Restoring the previously approved Contents read/write permission restored HTTP 200. No GitHub write request was made. Screenshots document the saved read-only setting and actual 403; the revised live success capture documents restored access.

GitHub currently lists Metadata read or Contents write as accepted Stargazers permission sets, and documents access restrictions to admins/collaborators. In this account, Metadata/read-only did not suffice in the observed test. This is evidence for retaining the scoped permission here, not a claim that every account requires write access. Reference: https://docs.github.com/en/rest/activity/starring#list-stargazers

## State and recovery

The first successful scheduled run initializes the checkpoint to the current time to suppress historical stars. For an intentional backfill, set initial_checkpoint to an ISO timestamp after reviewing notification volume. Manual editor runs do not establish scheduled static-data persistence.

Explicit request controllers paginate and enrich one profile at a time, retaining request progress only in the execution payload. Each page/profile request has a 10-second timeout and at most three attempts. Retries cover network errors, 429, 5xx, and rate-limited 403 responses; ordinary authentication/permission 403 errors stop immediately. Wait nodes respect Retry-After (seconds or HTTP date) and X-RateLimit-Reset, with 60/120-second fallback delays for rate limiting. A server deadline beyond the 300-second wait budget stops the run instead of retrying too early. New pages and profiles wait one second. Pagination is limited to 100 pages and validates the next URL before sending credentials.

All profile lookups must succeed before qualification. A batch containing only nonqualifying users commits every processed event immediately after successful enrichment. A mixed batch retains every event, including nonqualifying users, until all required Slack responses confirm ok: true. Exhausted retries, invalid profiles, incomplete batches and Slack errors leave the previous checkpoint unchanged. An empty poll leaves its baseline unchanged.

Run one execution at a time. Static data is not a transactional external store. Partial Slack delivery followed by failure can still cause duplicate notifications on retry; this does not claim exactly-once delivery. n8n persists static data on successful active executions, not manual editor tests.

## Tests and evidence

Run npm test and npm run lint (npm.cmd in restricted Windows PowerShell). See evidence/test-output.txt and evidence/syntax-checks.txt for exact output.

assignment-1-evidence-walkthrough.webm is a 24-second compilation of genuine screenshots: workflow import, live GitHub lookup, isolated AI connection and delivered Slack test. It is an evidence walkthrough, not a recording of a newly qualified lead. The repository had zero stars during verification. Filtering, multiple-lead pairing and notification-failure checkpoint handling are verified by automated tests.

## Separate controlled demonstrations

Import demo/simulated-lead-test.json as a separate, unpublished workflow. It has a manual trigger and no schedule. It substitutes only the star event with a clearly simulated octocat event; GitHub profile enrichment, exact qualification, the configured AI model and Slack HTTP delivery remain real nodes. Set the existing credentials and execute once in the private demo channel. The notification prominently says TEST ONLY - SIMULATED STAR EVENT. It has independent workflow static data and cannot alter the production checkpoint. The packaged workflow is reproducible and its successful real AI/Slack run is documented by evidence/controlled-lead-receipt.json and genuine screenshots. The single-event diagnostic has no pagination/retry loop; production retries are verified separately by regression tests and a no-network n8n runtime check. Current verification status is recorded in evidence/REVISION_STATUS.md.

The revised controlled-lead-evidence-walkthrough.mp4 is a compilation of genuine captures from the successful controlled run, AI output, Slack receipt and request-policy sandbox check. It is an evidence walkthrough, not a continuous execution recording. The earlier WEBM remains historical connectivity evidence. The runtime check confirmed n8n has no global URL constructor; production pagination therefore validates the HTTPS authority and listing path without relying on that global.

## Current submission video

Use evidence/assignment-1-current-demo.mp4 (38 seconds). It combines clearly labelled, genuine controlled-run captures with final publication evidence. It is a still-image evidence walkthrough. Earlier videos are historical. Public video: https://github.com/ChereddyGowtham11/weather-aware-order-delay-processor/blob/main/assignment-1/evidence/assignment-1-current-demo.mp4
