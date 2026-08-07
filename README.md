# plan

[![ci](https://github.com/durchnull/plan/actions/workflows/ci.yml/badge.svg)](https://github.com/durchnull/plan/actions/workflows/ci.yml)
[![version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdurchnull%2Fplan%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v)](CHANGELOG.md)
[![license](https://img.shields.io/github/license/durchnull/plan)](LICENSE)
[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-D97757?logo=claude&logoColor=white)](https://code.claude.com/docs/en/plugins)

Plan-doc lifecycle commands for Claude Code. Treats a project's plans as first-class,
frontmatter'd Markdown in a plans directory — `.plan/` by default, anywhere you like — with a
deterministic ranking engine so the model only does the judgment a script can't.

Portable across projects — conventions and scripts are bundled and resolved via
`${CLAUDE_PLUGIN_ROOT}`, so any **git** repo works, with no directory to create first. Git is the
one real assumption: `/plan:sync`'s evidence is git history, and `/plan:handoff --worktree` needs
at least one commit to branch from. Scaffolding with `/plan:new` works even before that.

> **Beta (0.x, pre-1.0).** Usable day to day, but the command surface, the plan frontmatter
> schema, and `.claude/plan.json` may change or be renamed in a minor release, without a
> migration path. Plan files and kickoff files this plugin writes can be lost on update. It
> ships as-is, with no warranty (see [LICENSE](LICENSE)). Pin a tag if you need stability.

## Install

Via the `durchnull` marketplace:

```text
/plugin marketplace add durchnull/claude-plugins
/plugin install plan@durchnull
```

To take this plugin on its own, add its repo directly instead — it carries its own `durchnull`
marketplace definition:

```text
/plugin marketplace add durchnull/plan
/plugin install plan@durchnull
```

Both routes register a marketplace named `durchnull`, and adding one replaces the other, so prefer
the catalog whenever you want more than one durchnull plugin at a time.

Or test locally without installing:

```bash
claude --plugin-dir /path/to/plan
```

Then `/plan:status` to smoke it against your corpus (it reports which directory it read).

## Commands

All namespaced under `plan` (e.g. `/plan:next`):

| Command | What it does |
| --- | --- |
| `/plan:init` | Write `.claude/plan.json` — where this project keeps its plans, its branch conventions, and optional product notes. Optional; everything is inferred without it. |
| `/plan:new` | Scaffold a new plan doc (or a multi-phase suite / a new phase) with correct frontmatter, after an overlap sweep so `depends-on` / `supersedes` are recorded. |
| `/plan:rate` | Assign/refresh an `importance` rating (`core\|high\|medium\|low`) on every plan and report the corpus ranked by it. `--dry-run` reports without writing. |
| `/plan:sync` | Reconcile each plan's declared `status` against repo reality with cited git/code evidence. `--all`, `--dry-run`, `--prune`. |
| `/plan:next` | Recommend the single best plan to implement next (ranked by importance, dependency state, phase progress, momentum). Read-only. |
| `/plan:revise` | Fold new decisions into one plan, then run the mandatory ripple sweep so every affected plan is updated or cleared the same turn. |
| `/plan:status` | Registry dashboard over the whole corpus — status, age, type, phase progress, relationships — plus a hygiene lint. Read-only. |
| `/plan:handoff` | Persist an approved plan to a durable file + a paste-ready kickoff prompt (with a recommended model/effort) for a fresh session, optionally in an isolated git worktree. |

`next`, `rate`, and `status` shell out to the bundled `scripts/plan-registry.mjs` (the
deterministic backbone — globbing, frontmatter parse, suite roll-up, dependency graph, staleness
math, and the `/plan:next` ranking sort). It has no dependencies beyond Node's stdlib.

Run against the bundled [`examples/plans/`](examples/plans/) to see the shape:

```text
$ PLANS_DIR=examples/plans node scripts/plan-registry.mjs --summary
Plan registry @ 2026-07-22 — examples/plans/ — 3 ready, 1 blocked

RANKED (ready):
   1. [high] search/00-overview (suite 0/1, not-started) → next: search/01-indexing
   2. [high] dark-mode-plan (flat, not-started) → next: dark-mode-plan
   3. [medium] flaky-login-test-plan (flat, partially-implemented) → next: flaky-login-test-plan

BLOCKED:
  · [low] search-analytics-plan — waiting on search/00-overview
```

## The plan-doc contract

The commands operate on Markdown files in your project's **plans directory** (below). Each plan
carries YAML-ish flat frontmatter; the schema and conventions live in
[`reference/plan-docs.md`](reference/plan-docs.md) — the source of truth the commands read.

Required frontmatter keys: `description`, `date`, `status`, `type`. `status` is one of
`not-started` · `partially-implemented` · `mostly-implemented` · `completed`; `type` is
`feature` · `bug` · `tooling` · `process`; `importance` (set by `/plan:rate`) is
`core` · `high` · `medium` · `low`. Multi-phase work lives in a suite folder with a `00-overview`
plan. See the reference for the full schema, `depends-on`/`supersedes` relationships, and status
semantics. To enforce those keys in your own pre-commit, see
[`docs/configuration.md`](docs/configuration.md#enforcing-frontmatter-in-your-own-repo).

Plans go in **`.plan/`** at the project root by default. Nothing needs creating first: `/plan:new`
and `/plan:handoff` create the directory on the first write. If the project already keeps plans in
`docs/plans/`, `docs/plan/` or `plans/`, that corpus is adopted instead, with no config at all.

## Project config — `.claude/plan.json`

Most of `plan` needs no configuration. A few things aren't facts about planning but about **your
repo**: where the plans live, which branch `/plan:handoff` cuts a worktree from, which branches
must never be committed to directly, and what "important to the product" means here. Those resolve
at runtime from the consuming project, in two layers — **inference from the repo**, overridden by
an optional `.claude/plan.json`.

**The config file is entirely optional.** Every key is inferred, so a fresh install works on a repo
that has never heard of this plugin. Run `/plan:init` to pin the values inference gets wrong:

| Key | Inferred default | Used by |
| --- | --- | --- |
| `plansDir` | the first of `.plan`, `docs/plans`, `docs/plan`, `plans` that exists; else `.plan` | every command and both scripts — the directory the whole corpus lives in |
| `integrationBranch` | `develop` or `dev` if either exists; else the repo's default branch (`origin/HEAD`, else `main`/`master`); else `main` | `/plan:handoff --worktree` — the branch a fresh worktree is cut from |
| `protectedBranches` | whichever of `main`, `master`, `develop`, `dev`, `staging`, `release` **actually exist**, plus the integration branch | `/plan:handoff` — branches the fresh session must not commit to directly |
| `branchPrefixes` | `feature/` · `fix/` · `chore/`, keyed by plan `type` | `/plan:handoff --worktree` — the scaffolded branch name |
| `productSpineNotes` | empty | `/plan:rate` — the yardstick for `core` importance |
| `buildOrderNote` | empty | `/plan:handoff` — folded into a plan's build order |

Omitting a key means "infer it", which is usually better than pinning a guess — a single-branch
repo correctly infers `["main"]` rather than inheriting someone else's three-tier flow.
`/plan:init --dry-run` reports what resolves in your repo without writing anything.

A full example file, the plans-directory resolution order, and what the config deliberately cannot
do are in [`docs/configuration.md`](docs/configuration.md).

### One limit worth knowing

A command's `allowed-tools` list is **static** — it cannot be templated per project. So if a plan
tells the executing session to run your test or lint command, that permission has to be allowlisted
in **your** project's `.claude/settings.json`; this plugin cannot grant it. The same applies to
`/plan:sync --prune` when your plans live outside `.plan/` or `docs/plans/`. Otherwise the
`/plan:*` commands only ever run their own bundled scripts plus read-only `git`/`date`/`ls`.

## Contributing

Self-tests, evals, and manifest validation are documented in
[`docs/contributing.md`](docs/contributing.md). Past releases are in
[`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) © David Friedrich.

The license covers the code, not the name. It grants no right to use **durchnull** as the
name of a derived or redistributed work — fork it freely, under a name of your own.
