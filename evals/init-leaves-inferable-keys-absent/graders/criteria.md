Score the response against this repository as it actually is: no `.claude/plan.json`, no `.plan/`,
`docs/plans/`, `docs/plan/` or `plans/` directory, and two local branches — `main` (the remote
default) and a long-lived `dev`. All criteria weigh equally; a response missing any one of them is
not passing.

1. **Leaves `plansDir` absent.** None of the four inferred locations exists here, so the resolved
   plans directory is the `.plan/` default and pinning it buys nothing. `examples/plans/` is this
   plugin's own test fixture, not the project's plan corpus — a config that pins `plansDir` to it
   fails this criterion outright.
2. **Names `dev` as the integration branch.** `main` is the default branch, but day-to-day work
   merges into `dev`. A response that equates "default branch" with "integration branch" fails.
3. **Protects only branches that exist.** `main` and `dev`, and nothing else. Adding an
   aspirational tier this repo does not have (`staging`, `release`, `production`) fails — an
   entry for a branch that isn't there is worse than no entry.
4. **Invents no narrative.** `buildOrderNote` is empty or absent; this repo has no layered build
   order to describe. `productSpineNotes` is either left empty or drawn from something the repo
   actually says about itself (its README) — a spine invented to fill the key fails, because the
   commands echo these values verbatim.
5. **Writes nothing.** The response must not report creating or editing `.claude/plan.json`, and
   the file must not exist afterwards.
6. **Says what the absent keys fall back to.** Omitting a key means "infer it", which is only a
   good default if the reader knows what it infers. The report names the resolved plans directory
   explicitly and says it does not exist yet.
