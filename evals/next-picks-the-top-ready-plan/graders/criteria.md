Score the response against the corpus in `examples/plans/`, which holds three ready plans and one
blocked plan. All criteria weigh equally; a response missing any one of them is not passing.

1. **Names the right winner.** The single recommendation is `search/00-overview` — the highest
   ranked ready plan. A response that recommends `dark-mode-plan`, `flaky-login-test-plan`, or
   `search-analytics-plan` as the top pick fails this criterion, even if it mentions the overview
   further down.
2. **Points at the phase, not just the suite.** Because `search/00-overview` is a suite overview,
   the concrete work named is its first unfinished phase, `search/01-indexing`. A recommendation
   that stops at the overview and never names the phase doc is incomplete.
3. **Reports the blocked plan as blocked.** `search-analytics-plan` is waiting on
   `search/00-overview`. It must not appear anywhere in the ranking of implementable work.
4. **Gives the ranking reason, not just the answer.** The justification refers to real signals —
   importance, dependency state, phase progress, or momentum — rather than asserting a pick with
   no basis. Inventing a signal the corpus does not carry fails this criterion.
5. **Changes nothing.** Recommending what to do next is read-only. The response must not report
   editing, creating, or deleting a plan file, and no file in `examples/plans/` may differ
   afterwards.
