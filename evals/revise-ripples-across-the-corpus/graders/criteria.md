Score the response against the copied corpus in `.dev/eval-revise/`. The target is
`search/00-overview`, whose Goal currently promises retrieval "in under 200 ms, with typo
tolerance". Copying the corpus is setup, not part of what is scored. All criteria weigh equally; a
response missing any one of them is not passing.

1. **Reconciles the target instead of appending to it.** The overview's Goal no longer promises
   typo tolerance — the sentence is rewritten so the doc reads as one coherent plan. An "UPDATE:"
   note, a revision log paragraph, or a Goal still carrying the old promise alongside the new one
   fails.
2. **Bumps `revised`, leaves `date` alone.** The overview gains `revised: <today> (<short note on
   the scope cut>)`, and its `date: 2026-07-08` is untouched.
3. **Ripples to the phase doc.** `search/01-indexing` builds the index the overview describes, so
   the sweep reaches it and either edits it (dropping typo tolerance changes what the index must
   support) or clears it with a stated reason. Leaving it unmentioned fails.
4. **Clears the dependent explicitly.** `search-analytics-plan` declares
   `depends-on: search/00-overview.md`, so the sweep must reach it and state a verdict — the edge
   still holds, the cut doesn't affect it. Silence about it fails: the cleared list is what makes
   the sweep trustworthy, and a ripple report that lists only what changed is not a sweep.
5. **Doesn't move status without evidence.** Cutting scope shrinks the plan, but nothing has
   landed, so `not-started` stays on every plan. Nothing is superseded either — this revision
   re-scopes the overview, it doesn't absorb another plan, so no `supersedes`/`superseded-by` pair
   appears anywhere.
6. **Contains the blast radius.** Only files under `.dev/eval-revise/` change. The tracked
   `examples/plans/` is unchanged, and no source file outside the plans directory is touched.
