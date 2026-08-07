Score the response against the copied corpus in `.dev/eval-handoff/`, whose `search/00-overview`
already lists `02-query-api.md` as the suite's second phase — "the ranked query endpoint (to be
written)". Copying the corpus is setup, not part of what is scored. All criteria weigh equally; a
response missing any one of them is not passing.

1. **Writes it into the suite, not beside it.** The approved plan *is* the phase the overview is
   waiting for, so it lands at `search/02-query-api.md` carrying `part-of: 00-overview.md`. A flat
   plan at the corpus root fails this criterion even when its content is right, and the overview's
   phase map should no longer read "to be written" for phase 2.
2. **Produces both files, with the right extensions.** A plan doc in Markdown and a paste-ready
   kickoff prompt written to a `.txt` file — never `.md`, which a docs viewer would publish as a
   spurious page and the registry would lint as a plan missing its frontmatter. The kickoff is
   also printed inline, raw, with no surrounding commentary.
3. **The kickoff points at the plan rather than copying it.** It names the plan file and tells the
   fresh session to read it fully before doing anything. Restating the plan's steps, constraints,
   or rationale inside the kickoff fails — a later revision would silently out-date the copy.
4. **States one model and one effort, argued from this plan.** Exactly one of each, with a
   one-line rationale tied to what this specific plan still demands. Effort is not raised to
   `xhigh` or `max`: the plan is settled and leaves no open questions, and a handoff means the
   thinking is largely done. A pick with no rationale, a hedge between two models, or a generic
   "handoff defaults to Opus" that never engages the plan fails.
5. **Assumptions are concrete and dated.** The kickoff's assumptions name checkable preconditions
   — phase 1's index exists, the feature flag exists — stamped with the date they were verified,
   and instruct the executor to stop if one is false. "The codebase is in a good state" is not a
   checkable assumption and fails.
6. **Hands off; doesn't build.** No endpoint, test, or source file is written. The only files
   created or edited are under `.dev/eval-handoff/`, and the tracked `examples/plans/` is
   unchanged.
