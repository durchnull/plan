---
model: sonnet
effort: medium
description: Scaffold a new plan doc (or a multi-phase suite, or a new phase in an existing suite) with correct frontmatter — after an overlap sweep against the existing corpus so relationships (depends-on / supersedes) are recorded and affected plans are updated the same turn. Skeleton to think in, not a finished plan.
argument-hint: "<slug or title> [--suite [phase names…]] [--phase <suite-folder>] [--type feature|bug|tooling|process] [--importance core|high|medium|low]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs":*), Bash(date:*), Bash(ls:*), Bash(git log:*)
---

# Plan new — scaffold a plan that knows its neighbors

Create a well-formed plan doc to **start** planning in — correct frontmatter, the standard
sections, and its relationships to the existing corpus already recorded. Where `/plan:handoff`
persists a plan *approved in this session*, this command opens a new one: the skeleton carries
the goal and open questions, and the thinking happens in it afterwards (in this session, plan
mode, or a later one). Conventions: `${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md` — read it first.

No-questions command: infer slug and type from the arguments/conversation, state the picks,
proceed.

**The plans directory** — every path below is relative to it, and it is created on first write if
it doesn't exist yet. This project's:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs" --plans-dir`

## 1. Parse `$ARGUMENTS`

- Free text → the **slug/title** (kebab-case the slug from it).
- `--suite [phase names…]` — scaffold a suite folder instead of a flat plan; optional phase
  names become the `NN-` docs (else scaffold the overview plus one `01-` placeholder).
- `--phase <suite-folder>` — add a new phase doc to an **existing** suite (next free `NN-`,
  `part-of` set, overview's phase map extended).
- `--type <t>` — force the type; else infer (`feature` for product behavior, `tooling` for
  dev/infra/claude-tooling, `bug` for a fix plan, `process` for living registries).
- `--importance <i>` — force the product-importance tier; else infer per the rule's
  "Importance" scale (`/plan:rate`'s signals: product spine → `core`, major surface → `high`,
  tooling/process default `medium`/`low`). Flat plans and suite overviews only — never on
  phase docs.

Collision checks before writing: the target path must be free, and a **flat plan's basename
should not equal a sibling suite folder's name** (nor a new suite folder's name a sibling
flat plan's basename) — the docs viewer keys pages by full path so both stay reachable, but a
folder node and a page link sharing a name are hard to scan in the sidebar. Basenames inside
different suite folders may repeat (pages are keyed by their full path within the plans
directory). On collision, pick a distinguishing name and say so.

## 2. Overlap sweep (before writing anything)

This is the coherence step — a new plan must not silently contradict or duplicate an existing
one:

1. Grep the corpus (`**/*.md` under the plans directory) for the new plan's key terms, feature
   names, and any file paths it will plausibly touch.
2. Classify every hit:
   - **builds on** → record `depends-on:` in the new plan.
   - **absorbs/replaces** (the old plan's scope lands inside the new one) → record
     `supersedes:` in the new plan **and** set `superseded-by:` + a one-line note in the old
     plan, same turn (the ripple rule).
   - **touches the same files but independent** → link it under "Context & prior art" so the
     eventual executor sees it; no frontmatter edge.
   - **contradicts** (the existing plan's approach is incompatible) → **stop scaffolding and
     surface it** — that conflict is a decision, not a default.
3. State the sweep's outcome in the report even when it's "no overlaps".

## 3. Write the skeleton

Frontmatter per the rule (required keys; `status: not-started`; `date` from `date +%F`;
`importance` from §1; any relationship keys from §2). Then the standard sections, with real content where the
conversation supplies it and explicit `TBD — <what's needed to decide>` markers where it
doesn't:

- **Goal** — one paragraph.
- **Context & prior art** — related plans (linked), relevant rules, current behavior.
- **Open questions** — the decisions still owed; a fresh skeleton usually has several.
- **Assumptions / preconditions** · **Steps / build order** · **Files & modules** ·
  **Verification** · **Out of scope** — same shapes `/plan:handoff` §3 defines; leave TBD
  markers rather than inventing specifics.

Suite mode: the folder, `00-overview.md` with the phase-map table (per-folder keys make the
plain name safe — every suite has its own), and each phase doc with `part-of:` pointing at
the overview's filename. Where the plans directory is rendered as a docs site, the suite appears
as its own collapsible folder node and the overview carries the suite's rolled-up `status` badge.

## 4. Report

Created path(s) (clickable) · the sweep verdict with every relationship recorded and every
neighboring plan edited · the inferred type · the open questions the plan still owes. Suggest
the natural next step: flesh it out now, or plan mode + `/plan:handoff` when it's approved.
