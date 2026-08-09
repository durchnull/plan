# Changelog

All notable changes to the `plan` plugin are documented here. This project adheres to
[Semantic Versioning](https://semver.org) and [Keep a Changelog](https://keepachangelog.com).

`plan` is pre-1.0: while the major version is `0`, the command surface and the plan frontmatter
schema may change in a minor release. Pin a tag if you need stability.

## [0.1.1] — 2026-08-09

### Changed

- The `/plugin` picker now labels this plugin "Plan (Beta)" while the major version stays `0`, so
  the pre-1.0 status is visible before install, not just in the README and this changelog.

## [0.1.0] — 2026-08-05

### Added

- Initial beta release under the `durchnull` marketplace.
- Eight commands: `/plan:init`, `/plan:new`, `/plan:rate`, `/plan:sync`, `/plan:next`,
  `/plan:revise`, `/plan:status`, `/plan:handoff`.
- Bundled `scripts/plan-registry.mjs` — the deterministic ranking backbone (globbing, frontmatter
  parse, suite roll-up, dependency graph, staleness math, `/plan:next` ranking sort).
- Bundled `scripts/check-plan-docs.mjs` — required-frontmatter validator (opt-in; no auto-firing
  hook). No-ops when a project has no plans dir.
- `reference/plan-docs.md` — the plan-doc conventions the commands read.
- A configurable plans directory: **`.plan/`** at the project root by default, moved anywhere in
  the project with `plansDir` in `.claude/plan.json`. Resolution is `PLANS_DIR` env → `plansDir`
  → inference over `.plan`, `docs/plans`, `docs/plan`, `plans` → `.plan`, so a repo that already
  keeps a corpus in a conventional place is adopted with no config at all.
- `examples/plans/` — a sample corpus used by CI and as living documentation.
- `evals/` — an eval suite over the bundled example corpus, one case per command, each with
  grader criteria: the ranking `/plan:next` produces, the `/plan:status` dashboard, the config
  `/plan:init` infers, the overlap `/plan:new` records, the ratings `/plan:rate` keeps, the
  ripple `/plan:revise` sweeps, the unverifiable claims `/plan:sync` reports, and the suite phase
  `/plan:handoff` writes. The three whose command writes run against a copy of the corpus, so a
  failing run can't rewrite its own answer key. Scored by a model rather than by an assertion, so
  it runs on demand rather than in CI — see the contributing notes for the tool grant and output
  directory a run needs.
- A worked `productSpineNotes` example in the config documentation, using the bundled example
  product so the yardstick `/plan:rate` applies is concrete rather than abstract.
