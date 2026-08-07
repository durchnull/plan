# Plan docs — conventions for the plans directory

The `/plan:*` commands treat plans as first-class Markdown inside the project's **plans
directory**, each carrying a small frontmatter block the commands read and write. The parser
supports **flat `key: value` lines only** — no lists, no nesting. Unknown keys are parsed but
ignored; an invalid `status`/`type`/`importance` value is **silently dropped** (never an error),
so lint typos via `/plan:status`. Where the plans directory is rendered as a docs site/viewer,
these keys are what a per-page summary, date, and status badge would read.

## Where the plans live

`<plans dir>` throughout this document means the project's plans directory, resolved at runtime:

1. `PLANS_DIR` in the environment — for CI and standalone script runs.
2. `plansDir` in `.claude/plan.json` — the project's own pin (`/plan:init` writes it). Must be a
   directory path inside the project; an absolute path or a `../` escape is rejected with a
   warning and ignored.
3. Inference — the first of `.plan/`, `docs/plans/`, `docs/plan/`, `plans/` that already exists,
   so a project that already keeps a corpus somewhere conventional is adopted as-is.
4. **`.plan/`** at the project root — the default when nothing above applies.

Nothing creates the directory in advance; `/plan:new` and `/plan:handoff` create it on first
write. Moving an existing corpus is a deliberate `git mv` plus a `plansDir` update — no command
migrates it for you.

## Layout & naming

- **Single plan:** `<plans dir>/<slug>-plan.md`, optionally paired with
  `<plans dir>/<slug>-kickoff.txt` (same `<slug>` stem). Kickoffs are **`.txt`, never `.md`** —
  the registry would otherwise lint them as plans missing their frontmatter, and a docs
  site/viewer rendering the directory would publish them as spurious pages.
- **Multi-phase suite:** `<plans dir>/<topic>/` containing `00-overview.md` (the entry point +
  phase map) and `NN-<phase-slug>.md` phase docs. Every phase doc carries
  `part-of: 00-overview.md`. A suite's kickoffs stay flat
  (`<plans dir>/<topic>-<phase>-kickoff.txt`) or are skipped entirely. The overview doc carries
  the suite's rolled-up `status` (its badge in the tree stands in for the folder), so keep the
  overview's roll-up honest.
- **Basenames only need to be unique within their own folder** — each page is keyed by its
  **full path** within the plans directory (minus `.md`) and folders are non-routable tree
  nodes, so every suite having its own `00-overview.md` is correct, not a collision, and a flat
  doc whose basename equals a sibling folder (e.g. `analytics.md` next to `analytics/`) stays
  reachable as a distinct link. Still, keep names distinct enough to scan in a sidebar.
- Kickoff files are disposable execution artifacts: once a plan is `completed` (or superseded),
  its kickoff should be deleted (`/plan:sync --prune`).

## Frontmatter schema

Required keys:

| key | value |
|---|---|
| `description` | 1–2 sentence card teaser — what the plan builds |
| `date` | creation date, `YYYY-MM-DD` from `date +%F`, **never edited afterwards** |
| `status` | `not-started` \| `partially-implemented` \| `mostly-implemented` \| `completed` |
| `type` | `feature` \| `bug` \| `tooling` \| `process` |

Optional keys (surfaced by `/plan:status`; only `importance` also renders in a viewer, as a
star rating). All plan paths are **relative to the plans directory** (e.g.
`targets-evolution/03-individualization.md`):

| key | value |
|---|---|
| `revised` | `YYYY-MM-DD (short note on what changed)` — bump on every substantive edit |
| `importance` | `core` \| `high` \| `medium` \| `low` — product importance (see below) |
| `part-of` | `00-overview.md` — phase docs only, points at their suite overview |
| `depends-on` | comma-separated plan paths this plan is blocked on / builds on |
| `supersedes` | plan path(s) this plan absorbs or replaces |
| `superseded-by` | reciprocal pointer on the absorbed plan — **always set both, same turn** |

### Importance

`importance` ranks a plan by **what it means for the overall product** (not urgency, not
effort). It lives on **flat plans and suite overviews only** — phase docs inherit their
suite's rating, so don't set it on them.

- `core` — defines or protects the product's central value or a load-bearing invariant.
  Losing this plan's outcome changes what the product fundamentally *is*.
- `high` — a major user-facing capability or a big product surface.
- `medium` — a useful improvement, supporting infrastructure, or quality-of-life work.
- `low` — peripheral: narrow internal tooling, nice-to-haves, process plumbing.

`/plan:rate` assigns and maintains it corpus-wide; `/plan:new` and `/plan:handoff` set an
initial rating at scaffold time. A pure rating edit is metadata, **not** a substantive plan
change — it does *not* bump `revised`. In a docs viewer it renders as a star rating in the
page header (`core` = 4 stars … `low` = 1); like `status`/`type`, an invalid value is silently
dropped — the stars just disappear.

## Status lifecycle

- `not-started` — design approved, no execution merged yet.
- `partially-implemented` — some steps/phases merged, the rest still open.
- `mostly-implemented` — functionally landed; the remaining gaps are enumerated in the doc.
- `completed` — shipped and verified; the doc is now history (keep it, don't archive).

Who moves it: **the session that ships plan work updates the status the same turn** (and bumps
`revised`); `/plan:sync` is the evidence-based safety net that reconciles drift. A status may
only reach `completed` with the plan's own Verification section satisfied — file existence alone
caps at `mostly-implemented`.

**Suite roll-up:** the overview's status is derived from its phases — all `not-started` →
`not-started`; all `completed` → `completed`; otherwise `partially-` or `mostly-implemented`.
Deferred-designs docs (slug/title says "later"/"deferred", e.g. `07-later.md`) are excluded
from the roll-up; they stay `not-started` without blocking the suite.

A superseded plan keeps its last real status and gains `superseded-by`; it is no longer
"active" for sync/staleness purposes.

## The ripple rule

A plan edit that changes another plan's truth — absorbs it, unblocks it, contradicts it,
re-scopes a shared file — **updates the other doc in the same turn** (its text and/or its
relationship keys, plus a `revised` bump). New plans run an overlap sweep against the existing
corpus before they're written. `/plan:new` and `/plan:revise` build this in; manual edits must
honor it too.

## The plan-suite commands

| command | job |
|---|---|
| `/plan:init` | write `.claude/plan.json` — this project's plans directory, branch conventions, product notes |
| `/plan:new` | scaffold a plan or suite skeleton to *start* planning, with the overlap sweep |
| `/plan:handoff` | persist **this session's approved plan** + kickoff prompt for a fresh session |
| `/plan:status` | registry dashboard: every plan's state, phases, relationships + hygiene lint |
| `/plan:rate` | assign/refresh every plan's `importance` rating against the product, ranked report |
| `/plan:next` | rank the active plans by readiness and recommend the best next implementation |
| `/plan:sync` | reconcile declared status against git/code evidence; `--prune` stale kickoffs |
| `/plan:revise` | fold new decisions into one plan, then ripple the change across the corpus |
