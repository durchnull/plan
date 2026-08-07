Score the response against the copied corpus in `.dev/eval-new/`, which holds `dark-mode-plan`,
`flaky-login-test-plan`, `search-analytics-plan`, and the `search/` suite. Copying the corpus is
setup, not part of what is scored. All criteria weigh equally; a response missing any one of them
is not passing.

1. **Runs the overlap sweep and states its outcome.** The report says which existing plans were
   checked and how each was classified. A well-formed skeleton written with no sweep reported
   fails this criterion — the sweep is what the command is for.
2. **Records the dependency in frontmatter.** Caching search results cannot precede search itself,
   so the new plan carries `depends-on: search/00-overview.md`. Naming the dependency only in
   prose, without the key, fails.
3. **Doesn't over-link.** `search-analytics-plan` shares the search area but is independent — it
   belongs under "Context & prior art", not as a `depends-on` or `supersedes` edge. `dark-mode-plan`
   and `flaky-login-test-plan` share nothing with this plan and should not appear at all.
4. **Frontmatter is complete and valid.** `description`, `date` (today, taken from `date +%F`
   rather than invented), `status: not-started`, `type: feature`, and an `importance` tier — flat
   `key: value` lines only, no nesting, no invented keys.
5. **Leaves honest TBDs.** This is a skeleton to think in, not a finished plan. Decisions the
   request never made appear as explicit `TBD — <what's needed>` markers and under "Open
   questions" — an invented cache backend, eviction policy, or TTL presented as settled fails.
6. **Touches only the new file.** This plan absorbs nothing, so no existing plan gains a
   `superseded-by` and no other file in `.dev/eval-new/` is edited. The tracked `examples/plans/`
   is unchanged.
