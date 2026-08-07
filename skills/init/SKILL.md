---
model: sonnet
effort: low
description: Interview this repo and write .claude/plan.json — the project-local config the /plan:* commands read for the plans directory, the integration branch, protected branches, branch prefixes, and optional product/build-order notes. Idempotent; preserves values you already set.
argument-hint: "[--force — rewrite keys that are already set] [--dry-run]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs":*), Bash(git branch:*), Bash(git symbolic-ref:*), Bash(git remote:*), Bash(ls:*)
---

# Plan init — teach this project's conventions to the plan commands

Most of `/plan:*` is about planning and needs no configuration. A few things aren't: where this
project keeps its plans, which branch a handoff worktree cuts from, which branches must never be
touched directly, and what "important to the product" means *here*. Those are facts about **this
repo**, so they live in this repo — `.claude/plan.json` — not in the plugin.

**Everything is optional.** The commands infer sensible values with no config file at all; this
command exists to pin the ones inference gets wrong and to record narrative inference can't
guess. It writes **config, not commands** — nothing is generated into `.claude/commands/`.

Currently resolved (inference + any existing config):

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs"`

No-questions command: infer, state the picks, write. `--dry-run` prints the file without writing.

## 1. Read what's already there

If `.claude/plan.json` exists, Read it first. **Every value already set is kept** — this command
is idempotent and safe to re-run after a plugin update. Without `--force`, only fill in keys that
are absent; with `--force`, re-propose every key but still show the old value alongside the new.

The block above already shows what resolves today and whether each value came from the config or
from inference — start from it rather than re-deriving.

## 2. Settle the plans directory (`plansDir`)

Where this project's plan docs live, relative to the project root. The default is **`.plan/`**;
`plansDir` moves it anywhere inside the repo (`docs/plans`, `docs/plan`, `planning/`, …).

The resolved block above already says which directory is in play and why. Confirm it against the
repo rather than assuming:

- If a plans corpus **already exists** (the block says "the directory already exists", or a Glob
  finds plan-shaped Markdown under `docs/plans/`, `docs/plan/`, `plans/`), that directory is the
  answer — moving an existing corpus is a decision the user makes, never a side effect of `init`.
- If nothing exists yet, leave the key **absent** unless the user wants a different location: an
  absent key means `.plan/`, and pinning the default buys nothing.
- Pin it explicitly when the project renders its docs tree as a site and the plans belong in it
  (`"plansDir": "docs/plans"`), or when the repo already has an unrelated `.plan` path.

Two constraints, both enforced by the resolver: the value must stay **inside** the project (no
absolute path, no `../`), and it names a directory, not a file. An invalid value doesn't break the
commands — it warns and falls back to inference — but it also doesn't do what was meant.

Directories other than the plans directory itself are unaffected: `/plan:sync --prune` is
pre-allowed to delete kickoff files under `.plan/` and `docs/plans/` only, so a project that pins
a different `plansDir` will see a permission prompt on the prune step unless it allowlists that
`rm` in its own `.claude/settings.json`.

## 3. Confirm the branch model

The inferred values come from the branches that actually exist. Check them against how the repo
really works, using evidence rather than assumption:

- `git branch -a` and `git symbolic-ref refs/remotes/origin/HEAD` — what exists and what the
  remote calls default.
- The project's own docs (`CLAUDE.md`, `CONTRIBUTING.md`, `README.md`) if they describe a branch
  flow, plus any branch-protection or deploy triggers in `.github/workflows/`.

Then settle:

- **`integrationBranch`** — the branch day-to-day work merges into and a fresh worktree should be
  cut from. On a single-branch repo this is just the default branch; where a long-lived
  integration branch exists (`develop`/`dev`), it's that.
- **`protectedBranches`** — every branch a session must never commit to directly. Only list
  branches that exist; an aspirational tier a repo doesn't have is worse than no entry.
- **`branchPrefixes`** — the prefix per plan `type`. Infer from existing branch names when the
  repo shows a habit (`fix/` vs `bugfix/` vs `hotfix/`); otherwise keep the defaults.

## 4. Offer the narrative keys

Two free-text keys carry what a schema can't, and both stay **empty unless there's something real
to say** — an invented note is worse than none, because commands echo them verbatim:

- **`productSpineNotes`** — what makes a plan `core` for *this* product: the load-bearing
  subsystems, the invariants a plan must not break. `/plan:rate` reads it as its yardstick.
  Draft it from whatever states the product's purpose (`CLAUDE.md`, a README overview, a
  `ROADMAP.md`) and keep it to a sentence or two.
- **`buildOrderNote`** — the order layers must be built in, when the project has one (a shared
  package before its consumers, schema before the code that reads it). `/plan:handoff` folds it
  into a plan's build order. Leave empty for a flat project.

## 5. Write it

Write `.claude/plan.json`, creating `.claude/` if needed. Stamp `"configVersion": 1`. Omit keys
you have nothing to say about — an absent key means "infer it", which is a better default than a
pinned guess. Preserve any unrecognized keys already in the file rather than dropping them.
Writing this file never creates, moves, or populates the plans directory itself; `/plan:new` and
`/plan:handoff` create it on first write.

```json
{
  "configVersion": 1,
  "plansDir": "docs/plans",
  "integrationBranch": "dev",
  "protectedBranches": ["main", "staging", "dev"],
  "branchPrefixes": { "feature": "feature/", "bug": "fix/", "tooling": "chore/" },
  "productSpineNotes": "",
  "buildOrderNote": ""
}
```

With `--dry-run`, print the file and stop.

## 6. Report

The path written (clickable) and whether it was **created** or **updated in place** · each key
with its value and where it came from (inferred / kept from the existing file / newly proposed) ·
every key deliberately left absent, with the inferred value it will fall back to. Name the
resolved plans directory explicitly and say whether it exists yet — that is the one value every
other `/plan:*` command builds paths from.

Close with the one genuinely leaky part of the setup: `allowed-tools` in a plugin command is
**static** and cannot be templated per project, so any project-specific gate command a plan's
Verification step runs (its test/lint/typecheck) must be allowlisted in this project's own
`.claude/settings.json` — the plugin cannot grant it.
