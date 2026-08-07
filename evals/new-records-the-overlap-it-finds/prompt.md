Copy `examples/plans/` to `.dev/eval-new/` and set `PLANS_DIR=.dev/eval-new` for everything you
run — `.dev/` is gitignored, so the tracked corpus stays as it is.

Then start a plan for caching search results, so a repeat query doesn't hit the index again.
