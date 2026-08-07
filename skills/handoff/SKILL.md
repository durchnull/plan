---
model: sonnet
effort: medium
description: Persist the current session's approved plan to a docs file plus a paste-ready kickoff prompt file to execute it in a fresh session — with a recommended model + effort, and optionally an isolated git worktree.
argument-hint: "[slug] [--worktree [branch]] [--file <path>] [--prompt-file <path>] [--model <m>] [--effort <e>]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs":*), Bash(date:*), Bash(git rev-parse:*), Bash(git status:*), Bash(git branch:*), Bash(git fetch:*), Bash(git worktree:*), Bash(git log:*)
---

# Plan Handoff

Take the plan that was just approved in **this** session, write it to a durable file, and produce a
ready-to-paste **kickoff prompt** for a *fresh* session to execute it — including a **recommended
model and effort level** for that session, and optionally an isolated git worktree so the new
session can't collide with this working tree.

**Why this exists.** Long build sessions hit compaction thrash: file-read state is lost and identical
failures replay. The durable fix is to stop planning and executing in one marathon — persist the
approved plan, then run the execution cold in a fresh (often isolated) session against that file.
This command is that move, made repeatable. It does **not** execute the plan; it hands it off.

This is a no-questions command (per the repo's "state assumptions, don't block" preference): infer the
slug, model, and effort, **state** them, and proceed. The one hard stop is "there is no plan to hand
off" (below).

This project's plans directory and branch conventions (inferred from the repo, overridden by
`.claude/plan.json` — run `/plan:init` to pin them). **`<plans dir>/` below means the resolved
plans directory**, and every default output path is relative to it:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-plan-config.mjs"`

## 1. Parse `$ARGUMENTS`

Pull out recognized flags; treat leftover free text as the **slug/title** for the plan file.

- `--worktree [branch]` — also scaffold an isolated git worktree + branch off the up-to-date
  integration branch for the fresh session (see §5). Optional explicit branch name; otherwise
  derived from the slug.
- `--file <path>` — override the plan output path (default `<plans dir>/<slug>-plan.md`).
- `--prompt-file <path>` — override the kickoff-prompt output path (default
  `<plans dir>/<slug>-kickoff.txt`). Both overrides are taken as given, project-root-relative.
- `--model <m>` — force the recommended model (`opus` | `sonnet` | `haiku` | `fable`), skipping §4's rubric.
- `--effort <e>` — force the recommended effort (`low` | `medium` | `high` | `xhigh` | `max`), skipping §4.

If no slug is given, derive a short kebab-case one from the plan's goal (e.g. a "prompt playground"
plan → slug `prompt-playground` → `<plans dir>/prompt-playground-plan.md`).

## 2. Locate the plan (the one hard stop)

The plan is whatever was **approved in this session**:

1. An approved **plan-mode** plan (the `ExitPlanMode` content), if this session used plan mode; else
2. the design/approach agreed in the conversation.

If **neither** exists — the session has no settled plan to hand off — **stop** and say so: ask the
user to run in plan mode (`Shift+Tab`) or describe the plan first. Do not invent a plan from thin air.

## 3. Write the plan file

Default path `<plans dir>/<slug>-plan.md`, creating the plans directory if this is the project's
first plan. **Before writing, if the file already exists, Read it** and reconcile rather than
clobber: if it's the same plan being iterated, update it in place; if it's an unrelated doc, pick a
new slug. Say which happened.

Structure it like a well-formed plan already in the corpus — one a cold reader can execute
without this conversation. Full plan-doc conventions (naming, frontmatter schema, suite layout,
lifecycle) live in **`${CLAUDE_PLUGIN_ROOT}/reference/plan-docs.md`** — that rule is the source of truth; the shapes
below follow it. If the plan is a **phase of an existing suite** (a `<plans dir>/<topic>/` folder),
write it there as the next `NN-<phase>.md` with `part-of:` set, instead of a flat file. Include,
in this order:

- **Frontmatter** (first thing in the file) — a small block the `/plan:*` commands parse for
  the summary, date, and status (and what a docs site/viewer would badge each page with). Flat
  `key: value` lines only (the parser supports nothing else):

  ```markdown
  ---
  description: <one- or two-sentence summary of what the plan builds — becomes the card teaser>
  date: <today, YYYY-MM-DD — from `date +%F`, never invented>
  status: not-started
  type: <feature | bug | tooling | process — the nature of the work; drives the card icon>
  importance: <core | high | medium | low — product importance per the rule's "Importance" scale>
  ---
  ```

  `status` must be one of `not-started` | `partially-implemented` | `mostly-implemented` |
  `completed` (any other value is silently dropped — same for `type`). A fresh handoff is always
  `not-started`; when **updating an existing plan in place**, keep its current status unless the
  reconciliation shows it changed, and bump `revised: <today> (note)` instead of touching `date`.
  Don't duplicate the date as a `_Created …_` line in the body — the frontmatter is the single
  source for it.

  **Relationship sweep:** grep the existing corpus for this plan's key terms/paths. If it builds
  on another plan add `depends-on: <path relative to the plans dir>`; if it absorbs one add
  `supersedes:` here **and** `superseded-by:` on the absorbed plan in the same turn (the ripple
  rule). State the sweep result even when it's "no overlaps".
- **Goal** — one paragraph: what we're building and why this shape.
- **Assumptions / preconditions** — what must **already be true** before execution starts (merged PRs,
  existing files, applied migrations, installed deps). Be specific and checkable — this list drives the
  "STOP if false" clause in the kickoff prompt, so a vague assumption defeats the whole handoff.
- **Steps / build order** — the concrete sequence, grouped by area and honoring the project's own
  build order (e.g. a shared package built before the app that consumes it). If the resolved config
  above carries a build-order note, follow it.
- **Files & modules** — the specific paths the work touches (so the fresh session doesn't re-hunt them).
  Flag any **paired-file** change explicitly — two files that must change together (a schema and its
  migration, a type and its validator, a generated file and its source) — both sides must move together.
- **Verification** — how the fresh session knows it's done: which tests, the project's typecheck and lint,
  any manual/browser check.
- **Out of scope / non-goals** and **open questions** — what to *not* build, and any decision still owed.

## 4. Recommend a model + effort (state one concrete pick)

Apply this rubric to **this specific plan** and choose exactly one model and one effort. Put the pick
and a one-line rationale in your report *and* at the top of the kickoff prompt (§6). `--model`/`--effort`
override the rubric.

**Model** — match capability to what execution still demands:

- **Opus 4.8** (`claude-opus-4-8`) — the default for a real handoff. Choose it when execution carries
  architectural weight, ambiguity, or risk: work crossing a module or service boundary, a
  **paired-file** mirror (two files that must change together), a **migration**, security-sensitive
  code, or a long multi-file build where one wrong turn compounds. (`/fast` gives Opus-quality output
  faster on 4.7/4.8 — suggest it when the work is Opus-worthy but mostly forward motion.)
- **Sonnet 5** (`claude-sonnet-5`) — when the plan is **fully specified and mechanical**: a clear file
  list, an established pattern to follow, low ambiguity. Faster and cheaper; the plan already did the
  hard thinking.
- **Haiku 4.5** (`claude-haiku-4-5-20251001`) — trivial/rote only (mechanical rename, doc tweak, in-range
  bump). Rare for a handoff — if it's Haiku-level it usually didn't need one.
- **Fable 5** (`claude-fable-5`) — the hardest, highest-stakes execution, where correctness outweighs
  its ~2× Opus pricing: a plan that rewires a load-bearing subsystem or breaks an invariant the
  product rests on, a high-blast-radius migration, or a long autonomous build nobody will be
  watching. Overkill for routine execution — Opus 4.8 stays the default.

**Effort** — a handoff means the *thinking is largely done*, so bias lower than you would for planning:

- **medium** (default) — the normal choice: the plan supplies the reasoning, execution follows it.
- **high** / **xhigh** — when steps still carry judgment (a paired-file mirror, a migration, a
  tricky refactor, security) or the plan left open questions. **`xhigh` needs Opus 4.7/4.8, Sonnet 5,
  or Fable 5** (not Haiku); high costs ~2–5× medium's tokens.
- **low** — a purely mechanical plan.
- Prefer a **per-turn** bump for one hairy step (`think hard` / `ultrathink` in that message) over
  raising the whole session's effort.

How the operator applies it (put this in the kickoff prompt): `/model <model>` selects the model,
`/effort <level>` sets session effort, and `ultrathink` in a single turn spikes that turn only.

## 5. Optional: scaffold an isolated worktree (`--worktree`)

Only when `--worktree` is passed. Gives the fresh session its own checkout so it can't collide with this
one (the sibling-session hazard). Honor the project's git flow — branch off the **integration branch**,
never commit to any **protected branch** directly (both resolved at the top of this command):

1. `git fetch origin` so the integration branch is current (no `origin`? skip the fetch and use
   the local branch).
2. Branch name: explicit arg, else `<prefix><slug>` where `<prefix>` is the resolved branch prefix
   for the plan's type (new functionality · bug · tooling/docs/refactor); default the `feature` prefix.
3. Check collisions: `git worktree list` and `git branch --list <branch>` — if either exists, pick a
   suffixed name and say so (worktree-name collisions are a known footgun).
4. Create it in a sibling dir: `git worktree add -b <branch> ../<repo>-<slug> origin/<integration-branch>`
   (fall back to the local integration branch if the remote-tracking one is unavailable). A repo
   with **no commits yet** has nothing to branch from — report that the first commit has to exist
   before `--worktree` can, and continue without the worktree. **Do not
   push** — the branch only needs to exist locally, and pushing a scaffold branch is not this
   command's job.
5. Report the worktree path and branch; the kickoff prompt (§6) tells the operator to start there.

If `--worktree` is **not** passed, skip creation here — but the kickoff prompt still tells the fresh
session to work in an isolated worktree (§6): sibling sessions sharing one tree is a known hazard, so
isolation is the default even when nothing is scaffolded now. Note in the report that
`claude --worktree <slug>` (the native flag) is the easiest way to start that session isolated.

## 6. Emit the kickoff prompt (write it to a file *and* print it)

Build a single kickoff block the user can paste verbatim into the fresh session. Fill every `<…>` from
the plan — no placeholders left in the output. Rules that keep it compact and non-stale:

- **The kickoff is a pointer, not a copy.** The fresh session reads the plan file fully — never
  restate its steps, constraints, or rationale in the kickoff (a revised plan would silently
  out-date the copy). Anything worth telling the executor belongs in the plan doc; put it there.
- **Don't repeat guaranteed context.** CLAUDE.md auto-loads in the fresh session — leave it out of
  the read list and omit the repo rules it already states (protected branches, lint/typecheck
  before shipping, core build order). Name only the plan-specific values: branch, tests, key files.
- **Conditional lines only when they apply:** the "`xhigh` needs Opus 4.7/4.8, Sonnet 5, or
  Fable 5" caveat only when the pick *is* xhigh; the `/fast` hint only when the pick is Opus; an
  `ultrathink` pointer only when §4 flagged a specific hairy step. Same for the closing gate
  line: "open a PR" only when the repo has a remote to PR against — otherwise the branch itself
  is the deliverable — and name only gates the project actually has (a project with no
  lint/typecheck/tests gets the plan's own Verification checks instead).
- **Paths, not line numbers**, in the read list — line numbers drift between handoff and execution.
- **Date-stamp the assumptions** so the executor knows how stale they may be.

Template:

```text
Set up: `/model <model-flag>` · `/effort <effort>`.<if §4 flagged one: " Use `ultrathink` on <that specific step>.">

You are executing <plans dir>/<slug>-plan.md — <one-line goal>. Read it fully before doing
anything, then <the plan's key files/rules to read first; for a paired-file change, both sides
of the pair>. The plan file, not this prompt, is the source of detail.

ASSUMPTIONS — verified <today YYYY-MM-DD>, re-verify; all must be true:
- <assumption 1 — e.g. "PR #NN (…) is merged into the integration branch">
- <assumption 2 — e.g. "migration <name> is applied">
If any is false (not merged, file/branch missing, schema differs), STOP and tell me before
writing anything. Do not improvise around a broken assumption.

Execute in the plan's build order. Work in an isolated worktree, never the main tree: <branch `<prefix>/<slug>`, already checked out in this worktree | cut a `<prefix>/<slug>` branch off your integration branch in a fresh worktree (start the session with `claude --worktree <slug>`, or create one before touching any files)>;
<open a PR | commit to the branch — no remote to PR against> once <the project's lint, typecheck, and the relevant tests | the plan's Verification checks, if the project has no such gates> are green.

WHEN DONE: update the plan's frontmatter (`status`, `revised` — per the plan-docs conventions),
then report what shipped, the <PR link | branch>, and anything deferred to your backlog<plus any plan-specific reportables>.
```

Then persist the **same** filled-in block to a file so it survives this session (a plan without its
kickoff prompt loses the model/effort pick and the read-order):

- Default path `<plans dir>/<slug>-kickoff.txt` (override with `--prompt-file`). Use `.txt`, **not**
  `.md` — a docs viewer/site globbing the plans directory for `*.md` would otherwise render the
  kickoff prompt as a spurious doc page, and the registry would lint it as a plan missing its
  frontmatter. Write the **raw prompt only** — no surrounding fence or commentary, so it's
  paste-ready as-is.
- If the file already exists, Read it first and reconcile the same way as the plan file (§3): update
  in place if it's the same handoff, else pick a new slug. Say which happened.
- The plan file and kickoff file share the `<slug>` stem so the pair is obvious (`<slug>-plan.md` +
  `<slug>-kickoff.txt`).

Finally, print the same block inline so the user can paste it immediately without opening the file.

## 7. Confirm

Report back:

- The plan file path (clickable) and whether it was **created** or **updated in place**.
- The kickoff-prompt file path (clickable) and whether it was **created** or **updated in place**.
- The worktree path + branch if `--worktree` created one (else the `claude --worktree <slug>` hint).
- The recommended **model + effort** with the one-line rationale from §4.
- The kickoff prompt block, ready to copy.
