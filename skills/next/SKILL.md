---
model: sonnet
effort: medium
description: Recommend what to implement next — rank the active plans by readiness (importance, dependency state, phase progress, momentum) and name the single best candidate with the runner-ups and why. Read-only; execution starts via the plan's kickoff or /plan:handoff.
argument-hint: "[--all — include blocked plans in the ranking table]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs":*), Bash(date:*), Bash(git log:*)
---

# Plan next — what should we build next?

Answer one question: **which plan is the best candidate for the next implementation session?**
The ranking is **computed deterministically** by `${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs` — your job is the
judgment the script can't do: read the winning candidates' bodies to describe what the next
session would concretely do, and write the recommendation. Read-only — no frontmatter edits, no
questions; if the evidence looks stale, say so and point at `/plan:sync` or `/plan:rate`, don't
fix it here. Conventions live in `${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md`.

## 1. Get the ranking

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs" --next`. It emits
`{ today, plansDir, candidates: { ready, blocked }, lint }`. The parsing, suite roll-up,
`depends-on` resolution, staleness math, and the ranking sort are already done —
**`candidates.ready` is the pick order** (rank 1 is the recommendation), sorted by the exact
priority chain below. Do **not** re-derive any of it by hand. `plansDir` is the directory it
read; join it with an `id` to get a path you can Read or link.

Each candidate carries: `kind` (`flat`|`suite`), `id` (plans-dir-relative, minus `.md`),
`importance`, `status`, `inFlight`, `blockedOn`, `caveats` (deps that are `mostly-implemented` —
ready *with* a caveat), `dependents`, `nextStepDoc` (the doc to read for the concrete next step —
for a suite, its next undone phase), `phaseProgress`, `lastActivity`, `ageDays`, `stale`, `rank`.

The ranking priority (already applied, for your explanation): **importance** (`core`>`high`>
`medium`>`low`, unrated last) → **finish over start** (`inFlight` beats `not-started`) →
**unblocking power** (`dependents` count) → **momentum** (`lastActivity`). When two adjacent
candidates tie on the first three, the sort is a judgment aid, not gospel — say so and let the
tie-break reasoning show.

## 2. Read for the concrete next step

For the **top ~3–4 ready candidates**, open each one's `nextStepDoc` and read enough (Goal +
first open step) to describe what the next session would actually *do* — the recommendation must
be concrete, not a title restated. For any candidate with `caveats`, open the caveat dependency
and name its enumerated gaps (why it's "ready with a caveat"). For a `stale` winner, skim its
body for obvious contradictions with the current code and note them — reconciling is
`/plan:revise`'s job, not yours.

## 3. Report

1. **The pick** — `candidates.ready[0]` (path, clickable), with: what implementing it next
   actually means (the concrete first step or next phase from §2), why it beat the runner-ups
   (which priority criteria decided), and any caveats (`caveats` deps' gaps, `stale` design). If a
   kickoff `.txt` exists next to it, point at it; otherwise note `/plan:handoff` or `/plan:new`
   can produce one.
2. **Runner-ups** — the next 2–3 ready candidates, one line each: what it is and the single
   reason it lost this round.
3. **The table** — every `ready` candidate, ranked: plan (path, clickable) · kind · importance ·
   status · next step · activity. With `--all`, append `candidates.blocked` below, each with the
   `blockedOn` dependency it's waiting on — "blocked" must be visible, not silently dropped.
4. One summary line: `ready` / `blocked` counts, plus any `lint` smells the script flagged
   (unrated plans, drifted statuses, stale actives) with the command that fixes each
   (`/plan:rate`, `/plan:sync`).
