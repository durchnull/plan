Copy `examples/plans/` to `.dev/eval-handoff/` and set `PLANS_DIR=.dev/eval-handoff` for
everything you run — `.dev/` is gitignored, so the tracked corpus stays as it is.

Here's what we settled on for the search query endpoint, and I'm happy with it: `GET /search?q=`
returns catalog items ranked by BM25 over the index phase 1 builds, capped at 50 per page with
cursor pagination. Exact and prefix matching, no typo tolerance. It reads the index directly —
no new service — and ships behind the feature flag that's already there. We're done when a
query-latency test holds under 200 ms at p95 and the ranking fixtures pass.

Hand that off so a fresh session can build it.
