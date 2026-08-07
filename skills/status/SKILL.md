---
model: sonnet
effort: low
description: Registry dashboard over the project's plans directory — every plan's status, age, type, phase progress, and relationships, plus a hygiene lint (frontmatter validity, suite integrity, kickoff pairing, folder shadowing, stale actives). Read-only; points at /plan:sync and /plan:revise for fixes.
argument-hint: "[slug — detail view for one plan]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs":*), Bash(date:*), Bash(ls:*), Bash(git log:*), Bash(head:*)
---

# Plan status — the plan registry

Render the current state of the whole plan corpus in one view, then lint it. This command is
**read-only** — it changes nothing; every finding names the command that fixes it
(`/plan:sync` for status drift and stale kickoffs, `/plan:revise` for content, a direct edit
for frontmatter typos). Conventions live in `${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md` — read it first.

## 1. Gather

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-registry.mjs"` — it emits
`{ today, plansDir, plans, suites, candidates, lint }` with the parsing, suite roll-up
(`suites[].done/total`, `rolledClass`, `declaredStatus`, `phases`), `depends-on`/`dependents`
graph, age math, and **every hygiene check in §3 already computed** under `lint`. Don't re-parse
frontmatter or re-resolve relationships by hand — consume the payload. `plansDir` is the
directory it read (`.plan/` by default, or whatever `.claude/plan.json` pins); every `id` is
relative to it, so join the two to get a path you can Read or link. `$ARGUMENTS` naming a slug switches to the **detail view** (§4); still run the
script, then narrow to that plan's records. Read a plan's body only when you need its prose (a
teaser, a phase's remaining gaps) — the `plans[].teaser` field gives a cheap one-liner.

## 2. The dashboard

Group into three sections, in this order:

1. **Active** — status `not-started` / `partially-implemented` / `mostly-implemented`, and not
   superseded.
2. **Superseded** — anything carrying `superseded-by`, whatever its status.
3. **Completed** — status `completed`.

One table row per flat plan and per **suite** (roll the suite up; don't flood the table with
phases). Columns: plan (path, clickable) · type · importance · status · created · revised ·
phases · relationships. Within each section, sort by importance (`core` first), then by most
recent activity — the top of Active is "the most product-critical open work".

- **Phases** (suites only): `done/total` where total excludes deferred-designs docs (slug/title
  says "later"/"deferred"). Under the suite row, list each phase on its own indented line with
  its status — the per-phase state is exactly what the roll-up hides.
- **Relationships**: compact `⇐ depends-on: …`, `⊃ supersedes: …` annotations.
- After the tables, one summary line: totals per status, and the oldest untouched active plan.

## 3. Hygiene lint

The script computes every check under `lint`; report only non-empty groups, each with the file,
the problem, and the fix pointer. The mapping to `lint` keys:

1. **frontmatter-valid** (`lint.frontmatterInvalid`) — missing required keys (`description`,
   `date`, `status`, `type`); a `status`/`type` value outside the enums (the viewer drops these
   **silently** — the card just loses its badge, so this lint is the only thing that catches the
   typo).
2. **suite-integrity** (`lint.suiteIntegrity`) — a phase doc missing `part-of`; an overview whose
   declared status disagrees with the roll-up **class** (the fuzzy partially↔mostly split is left
   to judgment and never flagged).
3. **relationship-integrity** (`lint.relationshipBroken`) — a `depends-on`/`supersedes`/
   `superseded-by`/`part-of` path that doesn't resolve (or is ambiguous); a `supersedes` without
   the reciprocal `superseded-by` on the target.
4. **kickoff-hygiene** (`lint.kickoffHygiene`) — a `*-kickoff.txt` with no matching plan; a
   kickoff whose plan is `completed` or superseded (stale → `/plan:sync --prune`). A kickoff
   accidentally saved as `.md` is caught by `check-plan-docs` / the docs viewer, not here.
5. **folder-shadowing** (`lint.folderShadowing`) — a flat `.md` whose basename equals a sibling
   suite folder's name (a docs viewer rendering the plans directory resolves that name to the
   folder first, making the doc unreachable). Basenames repeating across *different* suite
   folders are fine.
6. **stale-active** (`lint.staleActive`) — an active plan whose last activity is >30 days old.
   Not an error — a nudge to `/plan:revise` it, supersede it, or consciously let it sit.
7. **importance-hygiene** (`lint.importanceHygiene`) — an `importance` value outside
   `core|high|medium|low`; the key on a phase doc (it belongs on flat plans and suite overviews
   only); an unrated active flat plan or overview. All fix via `/plan:rate`.

## 4. Detail view (`$ARGUMENTS` = slug)

For one plan (match against filename stems; a suite folder name selects the suite): print its
full frontmatter, its phase list with statuses (suites), both directions of every relationship
(who it depends on **and who depends on it** — the script's `plans[].dependsOn`/`dependents`
fields, no grep needed), its kickoff file
if any, and any hygiene findings scoped to it. Finish with the last 5 `git log --oneline`
entries touching the file(s) so recent history is visible without leaving the view.

## 5. Report

The dashboard, then the hygiene findings (or "corpus clean"), then one recommended next action
(e.g. "3 plans look drifted — run `/plan:sync`"). Head the dashboard with the `plansDir` it
covers, so an empty corpus reads as "nothing in `<dir>/` yet" rather than "no plans exist" —
if that directory is not where this project keeps its plans, the fix is `plansDir` in
`.claude/plan.json` (`/plan:init`). No edits, no questions.
