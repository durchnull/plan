---
model: opus
effort: high
description: Fold new decisions into an existing plan doc (reconcile sections, bump revised), then run the mandatory ripple sweep — find every other plan the change affects and update, supersede, or explicitly clear each one the same turn, so the corpus stays coherent.
argument-hint: "<slug> [what changed — free text, else this session's discussion]"
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Grep, Glob, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs":*), Bash(date:*), Bash(git log:*), Bash(ls:*)
---

# Plan revise — evolve one plan, keep the corpus coherent

Plans get revisited, and a revision rarely stays contained: a re-scoped step absorbs another
plan, a dropped feature unblocks one, a new dependency appears. This command makes the
revision **and** its ripple one atomic move — the target plan is updated, then every other
plan is either updated too or explicitly cleared. Conventions and the ripple rule:
`${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md` — read it first.

The corpus this sweeps lives in this project's plans directory:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs" --plans-dir`

## 1. Locate the change

`$ARGUMENTS`: the first token matching a plan (filename stem, or suite folder → its overview
unless a phase is named) is the **target**; the rest is the change description. The change
itself comes from, in order: this session's discussion/decisions about the plan; else the
free-text description. If **neither** exists — nothing to fold in — stop and say so; don't
invent a revision. (Reviewing a plan against reality without new decisions is `/plan:sync`.)

## 2. Revise the target plan

Read it fully first. Then **reconcile, don't append**: rewrite the sections the change
touches (Goal/Steps/Files/Verification/Out of scope) so the doc reads as one coherent plan a
cold executor can follow — no "UPDATE:" scar tissue, no contradicting paragraphs left behind.

- Bump `revised: <today from date +%F> (one-line note on what changed)`. Never touch `date:`.
- Re-evaluate `status:` if the re-scope changed what "done" means (shrinking a plan can make
  landed work `mostly-implemented`; growing it can demote `mostly` to `partially`).
- If the plan has a paired `<slug>-kickoff.txt`, update it to match (assumptions, read order,
  build order) — a kickoff pointing at a superseded shape of the plan is worse than none.

## 3. The ripple sweep (mandatory — this is the command's point)

From what actually changed (files, features, decisions added or dropped), sweep every other
plan (`**/*.md` under the plans directory, active ones first but including completed — a
revision can invalidate recorded history's "how"):

Classify each plan that shares terms, paths, or an existing relationship edge:

- **needs-edit** — the change alters its assumptions, steps, or dependencies → apply the edit
  now, bump its `revised`.
- **superseded** — the revision absorbs its scope → set the `supersedes`/`superseded-by` pair
  both ways, note in the absorbed plan *where* its content now lives.
- **unblocked / newly-blocked** — add or drop `depends-on` edges on whichever side owns them.
- **contradicted** — the revision and that plan can't both be right, and resolving it isn't
  implied by the user's decision → **surface it as a decision owed**, don't pick silently.
- **unaffected** — say so explicitly for plans that shared terms but survive unchanged; the
  cleared list is what makes the sweep trustworthy.

Suites: revising a phase → re-check the overview's phase map and roll-up; revising an
overview → re-check every phase's `part-of` framing still holds.

## 4. Report

What changed in the target (per section, one line each) · the new `revised` line · the ripple
table: every plan touched (with its edit), superseded, or cleared — nothing merely implied ·
any contradiction left as an open decision. If the revision reshaped the plan enough that the
old kickoff/model recommendation no longer fits, suggest re-running `/plan:handoff`.
