#!/usr/bin/env node
// Deterministic gate for plan-doc frontmatter. Exits non-zero if any plan in the
// project's plans directory is missing a required key or uses an invalid value —
// safe to wire into a pre-commit hook or CI. No-ops when there is no plans dir.
//
// The required-key schema is mechanical (see reference/plan-docs.md "Frontmatter
// schema"): description, date, status, type — with status/type constrained to a
// known vocabulary. Kickoffs are .txt and skipped. Overview/phase nuances stay
// with /plan:status's judgment lint.
//
// Run: node scripts/check-plan-docs.mjs
//      node scripts/check-plan-docs.mjs --plans-dir   # print the directory it would check
//      node scripts/check-plan-docs.mjs --self-test

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DEFAULT_PLANS_DIR = ".plan";
const PLANS_DIR_CANDIDATES = [DEFAULT_PLANS_DIR, "docs/plans", "docs/plan", "plans"];

// Same precedence as resolve-plan-config.mjs: PLANS_DIR env > .claude/plan.json's
// plansDir > the first conventional directory that exists > .plan. Inlined rather
// than imported on purpose — this file is meant to be vendored into a project as a
// single dependency-free script (a git hook runs with no plugin root), so it must
// not reach for a sibling. CI asserts the two resolutions agree.
function resolvePlansDir() {
  if (process.env.PLANS_DIR) return process.env.PLANS_DIR.trim().replace(/\/+$/, "");
  try {
    const { plansDir } = JSON.parse(readFileSync(".claude/plan.json", "utf8"));
    if (typeof plansDir === "string" && plansDir.trim()) {
      const v = plansDir.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
      if (v && v !== "." && !path.isAbsolute(v) && !v.split(/[\\/]/).includes("..")) return v;
    }
  } catch {
    // No config, unreadable, or malformed — inference still gives a usable answer.
  }
  const isDir = (p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  return PLANS_DIR_CANDIDATES.find(isDir) ?? DEFAULT_PLANS_DIR;
}

const PLANS_DIR = resolvePlansDir();
const REQUIRED = ["description", "date", "status", "type"];
const STATUS = new Set(["not-started", "partially-implemented", "mostly-implemented", "completed"]);
const TYPE = new Set(["feature", "bug", "tooling", "process"]);

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (entry.endsWith(".md")) out.push(p);
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

function checkDoc(text, file) {
  const errs = [];
  const fm = parseFrontmatter(text);
  if (!fm) return [`${file}: no --- frontmatter block`];
  for (const key of REQUIRED) {
    if (!fm[key]) errs.push(`${file}: missing required frontmatter key "${key}"`);
  }
  if (fm.status && !STATUS.has(fm.status)) errs.push(`${file}: invalid status "${fm.status}"`);
  if (fm.type && !TYPE.has(fm.type)) errs.push(`${file}: invalid type "${fm.type}"`);
  return errs;
}

if (process.argv.includes("--plans-dir")) {
  console.log(PLANS_DIR);
  process.exit(0);
}

if (process.argv.includes("--self-test")) {
  const bad = "---\ndate: 2026-07-12\ntype: feature\n---\n# x\n"; // missing description + status
  const badErrs = checkDoc(bad, "<self-test>");
  if (badErrs.length !== 2) {
    console.error(`SELF-TEST FAILED: expected 2 errors, got ${badErrs.length}`);
    process.exit(1);
  }
  const good = "---\ndescription: x\ndate: 2026-07-12\nstatus: completed\ntype: feature\n---\n";
  if (checkDoc(good, "<self-test>").length !== 0) {
    console.error("SELF-TEST FAILED: false positive on a valid doc");
    process.exit(1);
  }
  console.log("check-plan-docs --self-test: OK");
  process.exit(0);
}

const errors = [];
for (const file of walk(PLANS_DIR)) {
  errors.push(...checkDoc(readFileSync(file, "utf8"), file));
}
if (errors.length > 0) {
  console.error(`✗ ${errors.join("\n✗ ")}`);
  process.exit(1);
}
console.log(`✓ all plan docs in ${PLANS_DIR}/ carry valid required frontmatter`);
