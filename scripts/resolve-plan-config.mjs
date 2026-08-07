#!/usr/bin/env node
// Resolves the consuming project's plan config for the /plan:* commands.
//
// Why: the commands need values that are facts about the *consuming* project, not
// about planning — where this project keeps its plans, which branch integration
// happens on, which branches must never be touched directly, what this product's
// spine is. Baking one project's answers into the command prose is what made this
// plugin non-portable.
//
// Three layers, lowest first:
//   1. Inference from the repo (which branches and which plans directory exist).
//   2. .claude/plan.json in the consuming project, cwd-relative — every key optional.
//   3. Nothing else. There is no global/user tier: an installed plugin is a single
//      machine-global mirror shared by every project, so per-project state cannot
//      live in this tree.
//
// plansDir alone has a layer above the config: the PLANS_DIR env var, so CI and
// standalone script runs can point the bundled scripts at any corpus.
//
// Must succeed with no config file, no origin, and no git repo at all — a project
// that never configures anything still gets working commands.
//
// Run:
//   node scripts/resolve-plan-config.mjs             # human/model-readable block (default)
//   node scripts/resolve-plan-config.mjs --json      # the resolved object as JSON
//   node scripts/resolve-plan-config.mjs --plans-dir # just the resolved plans directory
//   node scripts/resolve-plan-config.mjs --self-test

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const CONFIG_VERSION = 1;
export const CONFIG_PATH = ".claude/plan.json";

// Where plans live when nothing says otherwise: a dedicated directory at the
// project root, so a project gets a plan corpus without having to own a docs tree.
export const DEFAULT_PLANS_DIR = ".plan";
// Probed in order, default first — a project that already keeps a corpus under a
// conventional alternative is adopted as-is rather than orphaned by the default.
const PLANS_DIR_CANDIDATES = [DEFAULT_PLANS_DIR, "docs/plans", "docs/plan", "plans"];
// Ordered preference: the first that exists in the repo wins.
const INTEGRATION_CANDIDATES = ["develop", "dev"];
// Branches that are protected *if they exist*. Never invent one that doesn't.
const PROTECTED_CANDIDATES = ["main", "master", "develop", "dev", "staging", "release"];
const DEFAULT_PREFIXES = { feature: "feature/", bug: "fix/", tooling: "chore/" };

// ---------------------------------------------------------------------------
// Repo probes (every one degrades to a safe empty answer)
// ---------------------------------------------------------------------------

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

// Local heads + origin's remote-tracking branches, as bare names.
export function listBranches() {
  const out = git(["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin"]);
  if (!out) return [];
  const names = out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("origin/") ? s.slice("origin/".length) : s))
    .filter((s) => s !== "HEAD");
  return [...new Set(names)];
}

// The repo's own default branch, when it advertises one. Deliberately does NOT fall
// back to the checked-out branch first: work happens on topic branches, so HEAD is
// usually `feature/whatever` — reading that as "the default branch" would make the
// resolved config depend on what the user happened to have checked out.
export function detectDefaultBranch(branches = []) {
  const sym = git(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
  if (sym) return sym.trim().replace(/^origin\//, "");
  for (const b of ["main", "master"]) if (branches.includes(b)) return b;
  const head = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return head ? head.trim() : null;
}

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// The plans directory
// ---------------------------------------------------------------------------

// A trailing slash and a leading ./ are what people actually type. Accept both.
export function normalizePlansDir(value) {
  return String(value).trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
}

// A configured plansDir must stay a directory *inside* the project: it is joined
// against the consuming project's cwd, so an absolute path or a ../ escape would
// point one project's commands at another's files.
export function plansDirProblem(value) {
  if (typeof value !== "string" || !value.trim()) return "must be a non-empty string";
  const v = normalizePlansDir(value);
  if (!v || v === ".") return "must name a directory, not the project root itself";
  if (path.isAbsolute(v) || /^[A-Za-z]:[\\/]/.test(v)) return "must be relative to the project root";
  if (v.split(/[\\/]/).includes("..")) return "must stay inside the project root";
  return null;
}

export function inferPlansDir(dirExists = isDir) {
  return PLANS_DIR_CANDIDATES.find(dirExists) ?? DEFAULT_PLANS_DIR;
}

// The plans directory on its own, for the bundled scripts that need this one value:
// PLANS_DIR env (CI and standalone runs) > .claude/plan.json > inference > .plan.
// Deliberately git-free — building the registry must not pay for branch probes.
export function resolvePlansDir({ path: p = CONFIG_PATH, env = process.env } = {}) {
  if (env.PLANS_DIR) return normalizePlansDir(env.PLANS_DIR);
  const { config } = readConfigFile(p);
  if ("plansDir" in config && !plansDirProblem(config.plansDir)) {
    return normalizePlansDir(config.plansDir);
  }
  return inferPlansDir();
}

// ---------------------------------------------------------------------------
// Inference + merge (pure — this is what --self-test covers)
// ---------------------------------------------------------------------------

export function inferDefaults(branches, defaultBranch, plansDir = inferPlansDir()) {
  const has = (b) => branches.includes(b);
  const integrationBranch =
    INTEGRATION_CANDIDATES.find(has) ??
    (defaultBranch && has(defaultBranch) ? defaultBranch : null) ??
    defaultBranch ??
    "main";
  const protectedBranches = PROTECTED_CANDIDATES.filter(has);
  // A repo with no recognizable tier names still protects wherever HEAD integrates.
  if (!protectedBranches.includes(integrationBranch)) protectedBranches.push(integrationBranch);
  return {
    configVersion: CONFIG_VERSION,
    plansDir,
    integrationBranch,
    protectedBranches,
    branchPrefixes: { ...DEFAULT_PREFIXES },
    productSpineNotes: "",
    buildOrderNote: "",
  };
}

export function readConfigFile(path = CONFIG_PATH) {
  if (!existsSync(path)) return { present: false, config: {}, error: null };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { present: true, config: {}, error: `${path}: expected a JSON object` };
    }
    return { present: true, config: parsed, error: null };
  } catch (e) {
    // A broken config never hard-fails a command — inference still works.
    return { present: true, config: {}, error: `${path}: ${e.message}` };
  }
}

// Shallow merge, one level deep for branchPrefixes. Unknown keys pass through so a
// newer config on an older plugin degrades instead of erroring.
export function mergeConfig(defaults, file) {
  const merged = { ...defaults, ...file };
  merged.branchPrefixes = { ...defaults.branchPrefixes, ...(file.branchPrefixes ?? {}) };
  if (Array.isArray(file.protectedBranches)) merged.protectedBranches = [...file.protectedBranches];
  merged.configVersion = file.configVersion ?? defaults.configVersion;
  return merged;
}

// Which keys the project actually pinned, so the report can show provenance.
const sourcesOf = (file) =>
  Object.fromEntries(
    [
      "plansDir",
      "integrationBranch",
      "protectedBranches",
      "branchPrefixes",
      "productSpineNotes",
      "buildOrderNote",
    ].map((k) => [k, k in file ? "config" : "inferred"]),
  );

export function resolve({ path: configPath = CONFIG_PATH, branches, defaultBranch, env = process.env } = {}) {
  const b = branches ?? listBranches();
  const d = defaultBranch ?? detectDefaultBranch(b);
  const defaults = inferDefaults(b, d);
  const { present, config, error } = readConfigFile(configPath);
  const resolved = mergeConfig(defaults, config);
  const sources = sourcesOf(config);
  const warnings = [];
  if (error) warnings.push(`${error} — falling back to inference`);

  // plansDir carries one layer the other keys don't (the env override) and one
  // failure mode they don't (a path that escapes the project), so it settles here.
  const problem = "plansDir" in config ? plansDirProblem(config.plansDir) : null;
  if (problem) {
    warnings.push(`${configPath}: plansDir ${problem} — falling back to ${defaults.plansDir}/`);
    resolved.plansDir = defaults.plansDir;
    sources.plansDir = "inferred";
  } else {
    resolved.plansDir = normalizePlansDir(resolved.plansDir);
  }
  if (env.PLANS_DIR) {
    resolved.plansDir = normalizePlansDir(env.PLANS_DIR);
    sources.plansDir = "env";
  }

  if (present && typeof config.configVersion === "number" && config.configVersion > CONFIG_VERSION) {
    warnings.push(
      `${configPath} declares configVersion ${config.configVersion}, this plugin understands ${CONFIG_VERSION} — unknown keys ignored`,
    );
  }
  return {
    ...resolved,
    _meta: {
      configPresent: present,
      configPath,
      sources,
      plansDirExists: isDir(resolved.plansDir),
      warnings,
    },
  };
}

// ---------------------------------------------------------------------------
// Rendering — this text is substituted into a command body before the model reads it
// ---------------------------------------------------------------------------

export function render(r) {
  const { _meta } = r;
  const lines = [];
  lines.push(
    _meta.configPresent
      ? `Project plan config — from ${_meta.configPath} (unset keys inferred from the repo):`
      : `Project plan config — no ${_meta.configPath}; every value inferred from the repo:`,
  );
  const tag = (k) => (_meta.sources[k] === "config" ? "" : " (inferred)");
  const dirNote =
    _meta.sources.plansDir === "env"
      ? " (from the PLANS_DIR env override)"
      : _meta.sources.plansDir === "config"
        ? ""
        : _meta.plansDirExists
          ? " (inferred — the directory already exists)"
          : " (default — nothing created yet)";
  lines.push(`- Plans directory: ${r.plansDir}/${dirNote}`);
  lines.push(`- Integration branch: ${r.integrationBranch}${tag("integrationBranch")}`);
  lines.push(
    `- Protected branches (never commit to directly): ${r.protectedBranches.join(", ") || "none detected"}${tag("protectedBranches")}`,
  );
  const prefixes = Object.entries(r.branchPrefixes)
    .map(([k, v]) => `${k} → ${v}`)
    .join(" · ");
  lines.push(`- Branch prefixes by plan type: ${prefixes}${tag("branchPrefixes")}`);
  if (r.buildOrderNote) lines.push(`- Build order: ${r.buildOrderNote}`);
  if (r.productSpineNotes) lines.push(`- Product spine: ${r.productSpineNotes}`);
  for (const w of _meta.warnings) lines.push(`- ⚠ ${w}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Self-test — pure layers only, so it runs identically in CI and any checkout
// ---------------------------------------------------------------------------

function selfTest() {
  const fail = (m) => {
    console.error(`SELF-TEST FAILED: ${m}`);
    process.exit(1);
  };
  const eq = (a, b, m) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
  };

  // --- the plans directory ------------------------------------------------
  // Nothing on disk → the default, not a guess about someone's docs tree.
  eq(inferPlansDir(() => false), DEFAULT_PLANS_DIR, "no candidate dir exists");
  // An existing corpus under a conventional alternative is adopted, not orphaned.
  eq(inferPlansDir((d) => d === "docs/plans"), "docs/plans", "existing docs/plans adopted");
  eq(inferPlansDir((d) => d === "plans"), "plans", "existing plans/ adopted");
  // The default outranks every alternative when both exist.
  eq(inferPlansDir((d) => d === DEFAULT_PLANS_DIR || d === "docs/plans"), DEFAULT_PLANS_DIR, "default wins");

  eq(normalizePlansDir("./docs/plans/"), "docs/plans", "normalize leading ./ and trailing /");
  eq(normalizePlansDir("  .plan  "), ".plan", "normalize surrounding space");

  if (plansDirProblem("docs/plans")) fail("a plain relative dir must be accepted");
  if (plansDirProblem(".plan")) fail("the default dir must be accepted");
  if (!plansDirProblem("/var/plans")) fail("an absolute path must be rejected");
  if (!plansDirProblem("../sibling/plans")) fail("a ../ escape must be rejected");
  if (!plansDirProblem("")) fail("an empty plansDir must be rejected");
  if (!plansDirProblem(".")) fail("the project root itself must be rejected");
  if (!plansDirProblem(42)) fail("a non-string plansDir must be rejected");

  // --- branches ------------------------------------------------------------
  // A three-tier repo infers the tiers it actually has.
  const three = inferDefaults(["main", "dev", "staging", "feature/x"], "main", DEFAULT_PLANS_DIR);
  eq(three.integrationBranch, "dev", "three-tier integration branch");
  eq(three.protectedBranches, ["main", "dev", "staging"], "three-tier protected set");

  eq(three.plansDir, DEFAULT_PLANS_DIR, "inferred plans dir surfaces in the defaults");

  // A single-branch repo must NOT inherit a three-tier assumption.
  const solo = inferDefaults(["main"], "main", DEFAULT_PLANS_DIR);
  eq(solo.integrationBranch, "main", "single-branch integration branch");
  eq(solo.protectedBranches, ["main"], "single-branch protected set");

  // `develop` outranks `dev`; `master` is recognized.
  eq(inferDefaults(["master", "develop"], "master").integrationBranch, "develop", "develop preferred");
  eq(inferDefaults(["master"], "master").protectedBranches, ["master"], "master protected");

  // No git at all still yields something usable.
  const bare = inferDefaults([], null);
  eq(bare.integrationBranch, "main", "no-repo integration branch");
  eq(bare.protectedBranches, ["main"], "no-repo protected set");

  // An unusual default branch is protected even when it matches no known tier name.
  eq(inferDefaults(["trunk"], "trunk").protectedBranches, ["trunk"], "unknown default branch protected");

  // A checked-out topic branch must never be mistaken for the integration branch —
  // the resolved config cannot depend on what the user happens to have checked out.
  const onTopic = inferDefaults(["main", "some-topic-branch"], "main");
  eq(onTopic.integrationBranch, "main", "topic branch is not the integration branch");
  eq(onTopic.protectedBranches, ["main"], "topic branch is not protected");

  // Config overrides inference; unspecified keys keep their inferred value.
  const merged = mergeConfig(three, { integrationBranch: "integration", branchPrefixes: { bug: "bugfix/" } });
  eq(merged.integrationBranch, "integration", "config overrides integration branch");
  eq(merged.protectedBranches, ["main", "dev", "staging"], "unspecified key stays inferred");
  eq(merged.branchPrefixes, { feature: "feature/", bug: "bugfix/", tooling: "chore/" }, "prefixes merge per-key");

  eq(mergeConfig(three, { plansDir: "docs/plan" }).plansDir, "docs/plan", "config moves the plans dir");

  // Unknown keys survive the merge rather than erroring.
  if (mergeConfig(three, { futureKey: 1 }).futureKey !== 1) fail("unknown config key was dropped");

  // A malformed config file degrades to inference instead of throwing.
  const broken = readConfigFile("/nonexistent/definitely/not/here.json");
  if (broken.present || broken.error) fail("missing config should be absent-but-clean");

  // The env override outranks the config file — that is what lets CI and a
  // standalone run point the bundled scripts at any corpus.
  eq(resolvePlansDir({ path: "/nonexistent/plan.json", env: { PLANS_DIR: "examples/plans/" } }), "examples/plans", "env override wins");
  eq(resolvePlansDir({ path: "/nonexistent/plan.json", env: {} }), inferPlansDir(), "no env, no config → inference");

  // render() must never crash on a resolved object with empty notes.
  const meta = { configPresent: false, configPath: CONFIG_PATH, sources: sourcesOf({}), plansDirExists: false, warnings: [] };
  if (!render({ ...three, _meta: meta })) fail("render produced nothing");
  if (!render({ ...three, _meta: meta }).includes(`${DEFAULT_PLANS_DIR}/`)) fail("render omits the plans directory");

  console.log("resolve-plan-config --self-test: OK");
  process.exit(0);
}

// Only when run directly — the exported layers stay importable (and testable)
// without the CLI firing as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (arg === "--self-test") selfTest();
  else if (arg === "--json") console.log(JSON.stringify(resolve(), null, 2));
  // Just the path, for command bodies and shell use — skips the git probes.
  else if (arg === "--plans-dir") console.log(resolvePlansDir());
  else console.log(render(resolve()));
}
