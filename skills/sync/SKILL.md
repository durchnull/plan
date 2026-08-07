---
model: opus
effort: medium
description: Reconcile each plan doc's declared status against repo reality — gather git/code evidence for what actually landed, update status + revised frontmatter with the evidence cited, roll suite overviews up, and optionally prune stale kickoff files. Doc-only edits; --dry-run reports without writing.
argument-hint: "[slug] [--all] [--dry-run] [--prune]"
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs":*), Bash(date:*), Bash(git log:*), Bash(git ls-files:*), Bash(git show:*), Bash(ls:*), Bash(rm .plan/*-kickoff.txt), Bash(rm docs/plans/*-kickoff.txt)
---

# Plan sync — make declared status match reality

Plans drift: work ships and nobody flips `status:`, or a plan claims `completed` while half its
steps never landed. This command reconciles the plan corpus against the repo with **cited
evidence**, editing only plan docs (which is why it applies by default — the blast radius is
prose). Conventions and status semantics: `${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md` — read it
first.

The corpus lives in this project's plans directory:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs" --plans-dir`

## 1. Scope (`$ARGUMENTS`)

- Default: every **active** plan (not `completed`, not superseded — those are settled history).
- `<slug>` — just that plan (or suite, if the slug names a suite folder).
- `--all` — include completed/superseded plans too (catches a premature `completed`).
- `--dry-run` — full report, no edits.
- `--prune` — after syncing, delete stale kickoff files (§4).

## 2. Evidence, per plan

Read the plan fully and extract its **checkable claims**: the "Files & modules" paths, the
steps/phases, named migrations, endpoints, components, tests, and its Verification section.
Then check reality:

- Do the named files exist (`git ls-files`, Glob)? Do they contain the described behavior
  (Grep for the named exports/endpoints/columns — skim, don't deep-review)?
- What landed since the plan's `date`? `git log --oneline --since=<date> -- <paths>` on the
  plan's key paths; `git log --grep` on the plan's slug/feature terms for the merge/PR trail.
- For suites, do this **per phase doc**, then derive the overview via the roll-up rule
  (deferred-designs docs excluded).

Classify against the lifecycle semantics: nothing landed → `not-started`; some steps →
`partially-implemented`; functionally all there but Verification unconfirmed or gaps remain →
`mostly-implemented`; everything landed **and** the plan's own Verification section is
satisfied → `completed`. **File existence alone never yields `completed`** — if you can't see
verification evidence (tests present and referenced, a completion note, the verifying PR), cap
at `mostly-implemented` and say what's unverified.

## 3. Apply

For each plan whose classification differs from its declared status:

- Update `status:`, and bump `revised: <today> (status synced: <one-line evidence>)`. Never
  touch `date:`.
- Keep every edit to frontmatter (and, when the plan has one, its own progress checklist) —
  sync never rewrites plan prose; that's `/plan:revise`'s job.
- Suites: write the derived roll-up to the overview when it disagrees.
- If evidence shows a plan was absorbed by another (its content shipped via a different plan's
  work), don't silently complete it — set the `supersedes`/`superseded-by` pair instead and
  say so.

With `--dry-run`, skip all edits and print what *would* change.

## 4. Prune (`--prune` only)

List every `*-kickoff.txt` whose plan is now `completed` or superseded, then delete them
(kickoffs are disposable execution artifacts per the rule). Without `--prune`, just list them
as stale.

A command's `allowed-tools` is static and cannot be templated per project, so the deletion is
pre-allowed for kickoffs under `.plan/` and `docs/plans/` only. If this project's plans directory
is neither, the `rm` will ask for confirmation — that is expected; say so rather than working
around it, and point at allowlisting the exact pattern in the project's own
`.claude/settings.json`. Never widen the deletion beyond `<plans dir>/*-kickoff.txt`.

## 5. Report

A change table — plan · old status → new status · the 1–3 evidence pointers (commit hash, PR,
file path) that justify it — then unchanged-but-checked plans in one line, pruned/stale
kickoffs, and anything sync can't decide (ambiguous evidence, a plan whose claims aren't
checkable) flagged for a human read. Every status change must carry its evidence in the report;
an evidence-free change is a bug in the run.
