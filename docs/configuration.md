# Configuring `plan` for your project

Everything here is optional. Every key is inferred from the repo, so a fresh install works on a
project that has never heard of this plugin. The README's Project config section lists the keys
and their inferred defaults; this file covers the details behind them.

## Where the plans live

Plans go in **`.plan/`** at the project root by default — a dedicated directory, so a project gets
a plan corpus without having to own a docs tree. Nothing needs creating first: `/plan:new` and
`/plan:handoff` create it on the first write.

To keep them somewhere else, set `plansDir`. That is the whole move — the commands, both bundled
scripts, and every path they report follow it. The directory must be inside the project; an
absolute path or a `../` escape is rejected with a warning, and inference takes over.

Resolution order, highest first:

| Layer | Value | For |
| --- | --- | --- |
| `PLANS_DIR` env var | any path | CI and standalone script runs (that's how this repo's CI points at `examples/plans/`) |
| `plansDir` in `.claude/plan.json` | any in-project directory | your project's pin |
| inference | first of `.plan/`, `docs/plans/`, `docs/plan/`, `plans/` that **already exists** | adopting a corpus you already have |
| default | `.plan/` | a project starting fresh |

So an existing corpus is never orphaned: install the plugin in a repo that already keeps plans in
`docs/plans/` and the commands find them, with no config file at all. Moving one is deliberate —
`git mv` it and set `plansDir`; no command migrates it for you.

Two things stay fixed to the *project root*, not the plans directory: `.claude/plan.json` itself,
and `/plan:sync --prune`'s pre-allowed deletes (see [Static permissions](#static-permissions)).

## A full config file

Run `/plan:init` to pin the values inference gets wrong, or write the file by hand. Every key is
optional:

```json
{
  "configVersion": 1,
  "plansDir": "docs/plans",
  "integrationBranch": "dev",
  "protectedBranches": ["main", "staging", "dev"],
  "branchPrefixes": { "feature": "feature/", "bug": "fix/", "tooling": "chore/" },
  "productSpineNotes": "The catalog model and the checkout flow — a plan touching either is core.",
  "buildOrderNote": "core → api → web; the shared package builds before its consumers."
}
```

Omitting a key means "infer it", which is usually better than pinning a guess — a single-branch
repo correctly infers `["main"]` rather than inheriting someone else's three-tier flow. Unknown
keys are preserved and ignored, so a newer config never hard-fails an older plugin.

## Inspect what resolves

`/plan:init --dry-run` reports the resolved config without writing anything, and every command that
needs the config prints its resolution as it runs. From a clone of this repo:

```bash
node /path/to/plan/scripts/resolve-plan-config.mjs              # readable
node /path/to/plan/scripts/resolve-plan-config.mjs --json       # the resolved object
node /path/to/plan/scripts/resolve-plan-config.mjs --plans-dir  # just the plans directory
```

## Enforcing frontmatter in your own repo

`scripts/check-plan-docs.mjs` checks every plan's required frontmatter and exits non-zero on
problems. Nothing runs it for you — wire it up yourself if you want enforcement:

1. Copy the script into your own repo. It is one file with no dependencies. A git hook runs
   outside Claude Code, where `${CLAUDE_PLUGIN_ROOT}` does not exist, so the hook needs a real
   path — your own copy, or a path into a clone of this repo.
2. Call it from your pre-commit step, e.g. `node scripts/check-plan-docs.mjs`. It finds the plans
   directory exactly like the commands do, so your copy honors `plansDir` without being told, and
   it exits quietly when the project has no plans directory at all.

Run `node scripts/check-plan-docs.mjs --plans-dir` to print the directory it would check.

## Static permissions

A command's `allowed-tools` list is **static** — it cannot be templated per project. Two
consequences:

- If a plan's Verification step tells the executing session to run your test, lint, or typecheck
  command, that permission has to be allowlisted in **your** project's `.claude/settings.json`.
  This plugin cannot grant it.
- `/plan:sync --prune` deletes stale kickoff files, and its pre-allowed `rm` covers `.plan/` and
  `docs/plans/` only. Point `plansDir` somewhere else and the prune step asks for confirmation.
  Allowlist `Bash(rm <your dir>/*-kickoff.txt)` in your project if you want it silent.

Otherwise the `/plan:*` commands only ever run their own bundled scripts plus read-only
`git`/`date`/`ls`.
