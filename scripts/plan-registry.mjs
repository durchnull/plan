#!/usr/bin/env node
// Deterministic backbone for the /plan:* commands (next, status, rate).
//
// Why: /plan:next, /plan:status and /plan:rate each re-derived the same
// mechanical facts from plan frontmatter inside their prompts — globbing,
// flat key:value parsing, suite roll-up, depends-on graph resolution, staleness
// math, and the /plan:next ranking sort. That is all pure data → this script
// computes it once, so the LLM only does what needs judgment (reading a plan's
// body to describe the concrete next step, reconciling a stale design, writing
// the narrative). The ranking sort here IS the pick order in /plan:next.
//
// The parser is intentionally identical in spirit to check-plan-docs.mjs:
// flat `key: value` lines between --- fences only.
//
// The plans directory comes from resolve-plan-config.mjs (PLANS_DIR env >
// .claude/plan.json's plansDir > inference > .plan), so every command and script
// reads the same corpus without any of them hardcoding a path.
//
// Run:
//   node scripts/plan-registry.mjs            # full registry as JSON (default)
//   node scripts/plan-registry.mjs --next     # just the ranked /plan:next payload
//   node scripts/plan-registry.mjs --summary  # human-readable ranked table
//   node scripts/plan-registry.mjs --self-test

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resolvePlansDir } from "./resolve-plan-config.mjs";

const PLANS_DIR = resolvePlansDir();
const STATUS = new Set(["not-started", "partially-implemented", "mostly-implemented", "completed"]);
const TYPE = new Set(["feature", "bug", "tooling", "process"]);
const IMPORTANCE = ["core", "high", "medium", "low"];
const IMPORTANCE_RANK = { core: 4, high: 3, medium: 2, low: 1 };
// A dependency is "satisfied enough" to unblock a dependent at these statuses.
const SATISFYING = new Set(["completed", "mostly-implemented"]);
const STALE_DAYS = 30;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function walk(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => entry.endsWith(e))) out.push(p);
  }
  return out;
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

// Body Goal/description are read by the LLM, not here; we only need frontmatter.
function readGoalTeaser(text) {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  // First non-empty, non-heading line — a cheap "what is this" for the summary view.
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) return t.slice(0, 160);
  }
  return "";
}

const splitList = (v) =>
  v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

// Latest YYYY-MM-DD anywhere in a `revised` string (it can hold several
// `date (note)` entries); falls back to the bare date.
function lastActivity(fm) {
  const dates = [];
  for (const src of [fm.revised, fm.date]) {
    if (!src) continue;
    for (const d of src.match(/\d{4}-\d{2}-\d{2}/g) ?? []) dates.push(d);
  }
  return dates.sort().at(-1) ?? null;
}

const daysBetween = (fromISO, toISO) =>
  fromISO ? Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000) : null;

// plans-dir-relative id, minus .md — the stable key everything joins on.
const toId = (file) => path.relative(PLANS_DIR, file).replace(/\\/g, "/").replace(/\.md$/, "");

const isDeferred = (id, fm) =>
  /(?:^|[/-])(later|deferred)\b/i.test(id) || /\b(later|deferred)\b/i.test(fm.description ?? "");

const basename = (id) => id.split("/").at(-1);
const folderOf = (id) => (id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "");
const isOverview = (id) => basename(id) === "00-overview";
// Coarse lifecycle class — collapses the fuzzy partially↔mostly middle.
const statusClass = (s) =>
  s === "completed" ? "completed" : s === "not-started" || !s ? "not-started" : "in-progress";
const phaseNum = (id) => {
  const m = basename(id).match(/^(\d+)-/);
  return m ? Number(m[1]) : null;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export function buildRegistry(today = new Date().toISOString().slice(0, 10)) {
  const mdFiles = walk(PLANS_DIR, [".md"]);
  const txtFiles = walk(PLANS_DIR, [".txt"]);

  const plans = [];
  const byId = new Map();
  const byBasename = new Map(); // basename -> [id,...] for loose depends-on resolution

  for (const file of mdFiles) {
    const text = readFileSync(file, "utf8");
    const fm = parseFrontmatter(text) ?? {};
    const id = toId(file);
    const rec = {
      id,
      file,
      description: fm.description ?? "",
      date: fm.date ?? null,
      status: fm.status ?? null,
      type: fm.type ?? null,
      importance: fm.importance ?? null,
      revised: fm.revised ?? null,
      partOf: fm["part-of"] ?? null,
      dependsOnRaw: splitList(fm["depends-on"]),
      supersedesRaw: splitList(fm.supersedes),
      supersededByRaw: splitList(fm["superseded-by"]),
      isOverview: isOverview(id),
      isDeferred: isDeferred(id, fm),
      folder: folderOf(id),
      phaseNum: phaseNum(id),
      teaser: readGoalTeaser(text),
      lastActivity: lastActivity(fm),
    };
    rec.ageDays = daysBetween(rec.lastActivity, today);
    plans.push(rec);
    byId.set(id, rec);
    if (!byBasename.has(basename(id))) byBasename.set(basename(id), []);
    byBasename.get(basename(id)).push(id);
  }

  // Resolve a depends-on/supersedes reference (plans-dir-relative path OR a
  // bare basename) to a canonical id. Returns { id } or { unresolved | ambiguous }.
  const resolveRef = (ref, fromId) => {
    const clean = ref.replace(/\.md$/, "").replace(/^\//, "");
    if (byId.has(clean)) return { id: clean };
    // part-of and bare refs may be siblings of the referrer.
    const sibling = folderOf(fromId) ? `${folderOf(fromId)}/${clean}` : clean;
    if (byId.has(sibling)) return { id: sibling };
    const byBase = byBasename.get(basename(clean));
    if (byBase?.length === 1) return { id: byBase[0] };
    if (byBase?.length > 1) return { ambiguous: byBase };
    return { unresolved: ref };
  };

  // --- edges ---------------------------------------------------------------
  const dependentsOf = new Map(); // id -> Set of ids that depend on it
  for (const p of plans) {
    p.dependsOn = [];
    p.dependsOnUnresolved = [];
    for (const ref of p.dependsOnRaw) {
      const r = resolveRef(ref, p.id);
      if (r.id) {
        p.dependsOn.push(r.id);
        if (!dependentsOf.has(r.id)) dependentsOf.set(r.id, new Set());
        dependentsOf.get(r.id).add(p.id);
      } else {
        p.dependsOnUnresolved.push(r.ambiguous ? `${ref} (ambiguous)` : ref);
      }
    }
  }
  for (const p of plans) p.dependents = [...(dependentsOf.get(p.id) ?? [])];

  // --- suites --------------------------------------------------------------
  // A suite is a folder containing a 00-overview.md. Phases are its sibling
  // NN-*.md docs (deferred ones excluded from roll-up and next-phase pick).
  const suites = [];
  for (const overview of plans.filter((p) => p.isOverview)) {
    const phases = plans
      .filter((p) => p.folder === overview.folder && !p.isOverview)
      .sort((a, b) => (a.phaseNum ?? 999) - (b.phaseNum ?? 999) || a.id.localeCompare(b.id));
    const active = phases.filter((p) => !p.isDeferred);
    const done = active.filter((p) => p.status === "completed").length;
    // Coarse roll-up only — the rule fixes the all-done / all-open ends and
    // leaves partially↔mostly to judgment, so we never mechanically split it.
    const rolledClass =
      active.length === 0
        ? statusClass(overview.status)
        : active.every((p) => p.status === "completed")
          ? "completed"
          : active.every((p) => p.status === "not-started")
            ? "not-started"
            : "in-progress";
    // Next undone phase in filename order; the overview itself if the suite has no phases.
    const nextPhase = active.find((p) => p.status !== "completed") ?? null;
    suites.push({
      overviewId: overview.id,
      folder: overview.folder,
      importance: overview.importance,
      phases: phases.map((p) => p.id),
      activePhaseCount: active.length,
      done,
      total: active.length,
      declaredStatus: overview.status,
      rolledClass,
      nextPhaseId: nextPhase ? nextPhase.id : overview.id,
      lastActivity:
        [overview, ...phases]
          .map((p) => p.lastActivity)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
    });
  }
  const suiteFolders = new Set(suites.map((s) => s.folder));
  const inSuite = (p) => suiteFolders.has(p.folder);

  // --- candidates + blocking ----------------------------------------------
  const ACTIVE = new Set(["not-started", "partially-implemented", "mostly-implemented"]);
  const isActive = (p) => ACTIVE.has(p.status) && p.supersededByRaw.length === 0;

  // Blocking for a single node against its resolved dependency records.
  const classifyDeps = (depIds) => {
    const blockedOn = [];
    const caveats = [];
    for (const depId of depIds) {
      const dep = byId.get(depId);
      if (!dep) continue;
      if (dep.status === "completed") continue;
      if (dep.status === "mostly-implemented") caveats.push(depId);
      else blockedOn.push(depId);
    }
    return { blockedOn, caveats };
  };

  const candidates = [];

  // Flat plans: active, not part of a suite, not an overview/phase.
  for (const p of plans) {
    if (inSuite(p) || !isActive(p)) continue;
    const { blockedOn, caveats } = classifyDeps(p.dependsOn);
    candidates.push({
      kind: "flat",
      id: p.id,
      file: p.file,
      importance: p.importance,
      status: p.status,
      inFlight: p.status === "partially-implemented" || p.status === "mostly-implemented",
      blockedOn,
      caveats,
      dependents: p.dependents,
      nextStepDoc: p.id,
      lastActivity: p.lastActivity,
      ageDays: p.ageDays,
      stale: p.ageDays != null && p.ageDays > STALE_DAYS,
    });
  }

  // Suites: one candidate, collapsed to the next undone phase.
  for (const s of suites) {
    const overview = byId.get(s.overviewId);
    if (s.rolledClass === "completed" || overview.supersededByRaw.length > 0) continue;
    const next = byId.get(s.nextPhaseId);
    // Blocked by the next phase's own deps + any earlier non-deferred phase not yet satisfied.
    const earlierUndone = s.phases
      .map((id) => byId.get(id))
      .filter(
        (p) =>
          !p.isDeferred &&
          p.phaseNum != null &&
          next.phaseNum != null &&
          p.phaseNum < next.phaseNum &&
          !SATISFYING.has(p.status),
      )
      .map((p) => p.id);
    const { blockedOn, caveats } = classifyDeps(next.dependsOn);
    candidates.push({
      kind: "suite",
      id: s.overviewId,
      file: overview.file,
      importance: s.importance,
      status: s.declaredStatus,
      rolledClass: s.rolledClass,
      inFlight: s.rolledClass === "in-progress",
      blockedOn: [...blockedOn, ...earlierUndone],
      caveats,
      dependents: overview.dependents,
      nextStepDoc: s.nextPhaseId,
      phaseProgress: `${s.done}/${s.total}`,
      lastActivity: s.lastActivity,
      ageDays: daysBetween(s.lastActivity, today),
      stale: (() => {
        const d = daysBetween(s.lastActivity, today);
        return d != null && d > STALE_DAYS;
      })(),
    });
  }

  for (const c of candidates) c.blocked = c.blockedOn.length > 0;

  // --- ranking (this IS /plan:next's pick order) ---------------------------
  const ready = candidates.filter((c) => !c.blocked);
  const blocked = candidates.filter((c) => c.blocked);
  const cmp = (a, b) =>
    (IMPORTANCE_RANK[b.importance] ?? 0) - (IMPORTANCE_RANK[a.importance] ?? 0) || // importance
    Number(b.inFlight) - Number(a.inFlight) || // finish over start
    b.dependents.length - a.dependents.length || // unblocking power
    String(b.lastActivity ?? "").localeCompare(String(a.lastActivity ?? "")); // momentum
  ready.sort(cmp);
  ready.forEach((c, i) => {
    c.rank = i + 1;
  });
  blocked.sort(cmp);

  // --- smells / hygiene lint ----------------------------------------------
  const lint = runLint({ plans, byId, resolveRef, suites, txtFiles });

  return {
    today,
    // Every id below is relative to this — the consuming commands need it to turn
    // an id back into a path they can Read, Edit, or link.
    plansDir: PLANS_DIR,
    plans: plans.map((p) => ({
      id: p.id,
      status: p.status,
      type: p.type,
      importance: p.importance,
      isOverview: p.isOverview,
      isDeferred: p.isDeferred,
      inSuite: inSuite(p),
      dependsOn: p.dependsOn,
      dependents: p.dependents,
      lastActivity: p.lastActivity,
      ageDays: p.ageDays,
      teaser: p.teaser,
    })),
    suites,
    candidates: { ready, blocked },
    lint,
  };
}

// ---------------------------------------------------------------------------
// Hygiene lint (shared by /plan:status; a subset surfaces in /plan:next)
// ---------------------------------------------------------------------------

function runLint({ plans, byId, resolveRef, suites, txtFiles }) {
  const frontmatterInvalid = [];
  const relationshipBroken = [];
  const suiteIntegrity = [];
  const importanceHygiene = [];
  const staleActive = [];
  const kickoffHygiene = [];
  const folderShadowing = [];

  const REQUIRED = ["description", "date", "status", "type"];
  const ACTIVE = new Set(["not-started", "partially-implemented", "mostly-implemented"]);

  const folderNames = new Set(suites.map((s) => s.folder));

  for (const p of plans) {
    for (const key of REQUIRED) {
      const val = { description: p.description, date: p.date, status: p.status, type: p.type }[key];
      if (!val) frontmatterInvalid.push(`${p.id}: missing required key "${key}"`);
    }
    if (p.status && !STATUS.has(p.status))
      frontmatterInvalid.push(`${p.id}: invalid status "${p.status}"`);
    if (p.type && !TYPE.has(p.type)) frontmatterInvalid.push(`${p.id}: invalid type "${p.type}"`);
    if (p.importance && !IMPORTANCE.includes(p.importance))
      importanceHygiene.push(`${p.id}: invalid importance "${p.importance}"`);

    // relationship integrity: every referenced path must resolve.
    for (const [rel, refs] of [
      ["depends-on", p.dependsOnRaw],
      ["supersedes", p.supersedesRaw],
      ["superseded-by", p.supersededByRaw],
      ["part-of", p.partOf ? [p.partOf] : []],
    ]) {
      for (const ref of refs) {
        const r = resolveRef(ref, p.id);
        if (!r.id)
          relationshipBroken.push(
            `${p.id}: ${rel} → "${ref}" ${r.ambiguous ? "is ambiguous" : "does not resolve"}`,
          );
      }
    }
    // reciprocal supersedes / superseded-by
    for (const ref of p.supersedesRaw) {
      const r = resolveRef(ref, p.id);
      const target = r.id && byId.get(r.id);
      if (target && !target.supersededByRaw.some((b) => resolveRef(b, target.id).id === p.id))
        relationshipBroken.push(
          `${p.id}: supersedes ${r.id} but it has no reciprocal superseded-by`,
        );
    }

    // importance placement: on flat plans / overviews only.
    const inASuite = folderNames.has(p.folder);
    if (inASuite && !p.isOverview && p.importance)
      importanceHygiene.push(`${p.id}: phase doc carries importance (belongs on the overview)`);
    if ((!inASuite || p.isOverview) && !p.importance && ACTIVE.has(p.status))
      importanceHygiene.push(`${p.id}: active plan is unrated (run /plan:rate)`);

    // suite integrity: phase docs need part-of.
    if (inASuite && !p.isOverview && !p.isDeferred && !p.partOf)
      suiteIntegrity.push(`${p.id}: phase doc missing part-of`);

    // stale active
    if (
      ACTIVE.has(p.status) &&
      p.supersededByRaw.length === 0 &&
      p.ageDays != null &&
      p.ageDays > STALE_DAYS
    )
      staleActive.push(`${p.id}: last activity ${p.ageDays}d ago`);
  }

  // suite roll-up disagreement — compared at the coarse class only, so the
  // legitimate partially↔mostly judgment call is never flagged.
  for (const s of suites) {
    const ov = byId.get(s.overviewId);
    if (ov.status && s.activePhaseCount > 0 && statusClass(ov.status) !== s.rolledClass)
      suiteIntegrity.push(
        `${s.overviewId}: declared "${ov.status}" ≠ rolled-up ${s.rolledClass} (${s.done}/${s.total} phases done)`,
      );
  }

  // kickoff hygiene: *-kickoff.txt with no matching plan, or plan completed/superseded.
  for (const kf of txtFiles) {
    const rel = path.relative(PLANS_DIR, kf).replace(/\\/g, "/");
    const id = rel.replace(/-kickoff\.txt$/, "").replace(/\.txt$/, "");
    const folder = folderOf(id);
    const stem = basename(id);
    const num = stem.match(/^(\d+)-/)?.[1];
    const match = plans.find(
      (p) =>
        p.id === id ||
        basename(p.id) === stem ||
        basename(p.id) === `${stem.replace(/-plan$/, "")}-plan` ||
        // same suite folder + same NN- phase number (kickoffs often rename the slug)
        (num != null && p.folder === folder && String(p.phaseNum) === num),
    );
    if (!match) kickoffHygiene.push(`${rel}: no matching plan`);
    else if (match.status === "completed" || match.supersededByRaw.length > 0)
      kickoffHygiene.push(
        `${rel}: plan is ${match.supersededByRaw.length ? "superseded" : "completed"} — prune`,
      );
  }

  // folder shadowing: flat .md whose basename equals a sibling suite folder name.
  for (const p of plans) {
    if (folderNames.has(`${p.folder}/${basename(p.id)}`.replace(/^\//, "")))
      folderShadowing.push(`${p.id}: shadows sibling suite folder of the same name`);
  }

  return {
    frontmatterInvalid,
    relationshipBroken,
    suiteIntegrity,
    importanceHygiene,
    staleActive,
    kickoffHygiene,
    folderShadowing,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function summary(reg) {
  const lines = [];
  lines.push(
    `Plan registry @ ${reg.today} — ${reg.plansDir}/ — ${reg.candidates.ready.length} ready, ${reg.candidates.blocked.length} blocked\n`,
  );
  lines.push("RANKED (ready):");
  for (const c of reg.candidates.ready) {
    const prog = c.phaseProgress ? ` ${c.phaseProgress}` : "";
    const cav = c.caveats.length ? ` ⚠dep:${c.caveats.join(",")}` : "";
    const stale = c.stale ? " ⏳stale" : "";
    lines.push(
      `  ${String(c.rank).padStart(2)}. [${c.importance ?? "unrated"}] ${c.id} (${c.kind}${prog}, ${c.status})${cav}${stale} → next: ${c.nextStepDoc}`,
    );
  }
  if (reg.candidates.blocked.length) {
    lines.push("\nBLOCKED:");
    for (const c of reg.candidates.blocked)
      lines.push(
        `  · [${c.importance ?? "unrated"}] ${c.id} — waiting on ${c.blockedOn.join(", ")}`,
      );
  }
  const smells = Object.entries(reg.lint).filter(([, v]) => v.length);
  if (smells.length) {
    lines.push("\nSMELLS:");
    for (const [k, v] of smells) for (const msg of v) lines.push(`  · ${k}: ${msg}`);
  }
  return lines.join("\n");
}

function selfTest() {
  const reg = buildRegistry("2026-07-16");
  const fail = (m) => {
    console.error(`SELF-TEST FAILED: ${m}`);
    process.exit(1);
  };
  if (!reg.candidates.ready.length) fail("no ready candidates found in the real corpus");
  // ranks are dense and 1-based
  reg.candidates.ready.forEach((c, i) => {
    if (c.rank !== i + 1) fail(`rank not dense: #${i} has rank ${c.rank}`);
  });
  // importance never sorts a lower tier above a higher one at the top
  const ranked = reg.candidates.ready;
  for (let i = 1; i < ranked.length; i++) {
    const prev = IMPORTANCE_RANK[ranked[i - 1].importance] ?? 0;
    const cur = IMPORTANCE_RANK[ranked[i].importance] ?? 0;
    if (cur > prev) fail(`importance out of order at ${i}: ${ranked[i].id}`);
  }
  // no candidate is both ready and blocked
  const readyIds = new Set(ranked.map((c) => c.id));
  for (const b of reg.candidates.blocked)
    if (readyIds.has(b.id)) fail(`${b.id} is both ready and blocked`);
  // blocked candidates actually have a blocker
  for (const b of reg.candidates.blocked)
    if (!b.blockedOn.length) fail(`${b.id} is blocked with no blocker`);
  console.log(
    `plan-registry --self-test: OK (${reg.candidates.ready.length} ready, ${reg.candidates.blocked.length} blocked)`,
  );
  process.exit(0);
}

const arg = process.argv[2];
if (arg === "--self-test") selfTest();
else {
  const reg = buildRegistry();
  if (arg === "--summary") console.log(summary(reg));
  else if (arg === "--next")
    console.log(
      JSON.stringify(
        { today: reg.today, plansDir: reg.plansDir, candidates: reg.candidates, lint: reg.lint },
        null,
        2,
      ),
    );
  else console.log(JSON.stringify(reg, null, 2));
}
