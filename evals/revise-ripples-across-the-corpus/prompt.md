Copy `examples/plans/` to `.dev/eval-revise/` and set `PLANS_DIR=.dev/eval-revise` for everything
you run — `.dev/` is gitignored, so the tracked corpus stays as it is.

We've decided search won't do typo tolerance after all: exact and prefix matching only, so we can
ship it sooner. Fold that into the search plan.
