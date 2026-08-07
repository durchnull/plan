---
model: sonnet
effort: medium
description: Assign or refresh an `importance` rating (core|high|medium|low) on every plan doc — judged against what the plan means for the overall product — and report the corpus ranked by it. Doc-only frontmatter edits; --dry-run reports without writing.
argument-hint: "[slug — rate just one plan] [--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Edit, Grep, Glob, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs":*), Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs":*), Bash(date:*), Bash(ls:*), Bash(git log:*)
---

# Plan rate — rank the corpus by product importance

Give every plan doc an `importance` rating so the registry answers "which of these actually
matter for the product?" — not just "what state are they in?". The rating measures **product
significance**, never urgency or effort. Semantics and schema live in
`${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md` → "Importance" — read it first.

No-questions command: judge, state the rationale, write. `--dry-run` produces the same report
without editing any file. A slug in `$ARGUMENTS` rates only that plan (matching filename stems;
a suite folder name selects its overview).

This project's config, including any spine notes that define what `core` means here (set them
with `/plan:init`):

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs"`

## 1. Gather the evidence

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs"` — its `plans[]` gives every doc's frontmatter, current
   `importance`, `inSuite`/`isOverview` flags (so you know which docs are ratable — importance
   lives on **flat plans and suite overviews only**; phases inherit), and the resolved
   `dependents` graph. `lint.importanceHygiene` already lists the unrated and mis-placed ones —
   that's your worklist. Read each ratable doc's body (Goal + description) to know what it builds.
2. Load the product yardstick: the config's spine notes if set, plus whatever states the product's
   purpose and direction (a project `CLAUDE.md` or README overview, a `ROADMAP.md`), so
   "importance to the product" has a reference.
3. Use the payload's `dependents` for graph centrality: a plan many plans build on carries more
   weight than its own text suggests — no grep needed.

## 2. Rate each plan

Apply the rule's scale (`core` / `high` / `medium` / `low`) using these signals, in rough
priority order:

- **Touches the product's spine** — a load-bearing subsystem, a core domain model, or an
  invariant the product's correctness rests on → pulls toward `core`. The project's own spine
  notes (above, when set) name these concretely; without them, derive the spine from the
  yardstick read in §1.2.
- **User-facing surface size** — a whole new capability or major flow → `high`; a refinement
  of an existing flow → `medium`.
- **Graph centrality** — several plans depend on it → bump one tier.
- **Type prior** — `process`/`tooling` plans default `medium`/`low` unless they guard product
  correctness (e.g. migration safety) — being fun to build is not importance.
- **Superseded plans** keep a rating (history still has weight) but are reported separately;
  never bump a rating because a plan is old or stale — that's `/plan:status`'s stale lint.

Re-runs are **idempotent by default**: keep an existing rating unless the evidence has changed
(a revision re-scoped the plan, new dependents appeared). Call out every upgrade/downgrade
explicitly with the old → new tier and why.

## 3. Write the ratings

Unless `--dry-run`: for each plan whose rating is new or changed, insert/update the
`importance:` line in its frontmatter (flat `key: value`, conventionally right after `type:`).
Nothing else moves — **no `revised` bump** (a rating is metadata, per the rule), no `date`
touch, no body edits. Phase docs never get the key; if one already carries it, remove it and
note the cleanup.

## 4. Report

The corpus ranked by importance — one section per tier (`core` first), each row: plan (path,
clickable) · type · status · one-line rationale for the tier. Then:

- **Changes**: every rating written this run (new / upgraded / downgraded, with reasons).
- **Skipped**: phase docs (inherit) and anything unratable (say why).
- One summary line: counts per tier, plus the highest-importance plan that is still
  `not-started` — that's the "what should we build next" pointer this command exists for.

`--dry-run`: same report, prefixed with a note that nothing was written.
