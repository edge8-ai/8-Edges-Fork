#!/usr/bin/env node
// The gates of `npm run check:gates`, for one push: every gate, except the
// few slow ones the push's changed files cannot affect (PP.1).
//
// Why. The code tier of the pre-push hook lints and tests only what a push
// touched, but it ran all 34 gates whatever changed. Measured on 2026-11-13,
// they took 85 s, and four held 72%: check:fork-safe (22.5 s), which stages
// the whole fork tree; check:lint-warnings (18.3 s), which ran ESLint over the
// whole tree again; check:design (13.7 s) and check:utilities-scope (6.7 s),
// which read every stylesheet and component. A push that touches none of what
// one of them reads cannot change its answer, so that gate is skipped and says
// why. Every other gate takes under 3 s and always runs.
//
// The list of gates is package.json's `check:gates`, read here, so the full
// check and this one cannot drift apart. With no changed-file list
// (EDGE8_PUSH_CHANGED unset, as when this runs by hand) every gate runs, so
// it never checks less than `npm run check:gates` does. A gate whose own
// script or baseline changed always runs. Everything here is decided by file
// paths alone: the hook ships to the fork and to client repositories, which
// have no model to ask.
//
//   node scripts/run-gates.mjs            the gates, for the push's changed files
//   node scripts/run-gates.mjs --plan     print what would run and why, run nothing

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countWarnings } from "./check-lint-warnings.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

// The files a lint run covers: the lint roots and the script extensions, the
// same filter scripts/lint-changed.sh applies.
export function isLintable(p) {
  return /^(app|kernel|entities)\//.test(p) && /\.(js|mjs|cjs|jsx|ts|mts|cts|tsx)$/.test(p);
}

// What check:design and check:utilities-scope read: stylesheets and code
// under the app roots (asset references, font weights, class names), and the
// public assets those reference.
export function isStyleOrUiInput(p) {
  return (/^(app|kernel|entities)\//.test(p) && /\.(css|js|mjs|jsx|ts|tsx)$/.test(p)) || p.startsWith("public/");
}

// Changes to the fork's own machinery change what ships even when the files
// themselves are excluded (.github/ is excluded wholesale), so they always run
// check:fork-safe.
const FORK_MACHINERY = [
  /^\.github\/fork-overlay\//,
  /^\.github\/fork-sync-exclude/,
  /^\.github\/scripts\/(stage-fork-tree|scan-tree)\.sh$/,
  /^scripts\/(check-fork-safe|gen-fork-excludes|fork-tree)\.mjs$/,
];

/** The exclude patterns as stage-fork-tree.sh reads them: comments and blanks dropped. */
export function readExcludes(root = ROOT) {
  const out = [];
  for (const f of [".github/fork-sync-exclude.txt", ".github/fork-sync-exclude.generated.txt"]) {
    const file = path.join(root, f);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const p = line.replace(/#.*/, "").trim();
      if (p) out.push(p);
    }
  }
  return out;
}

function globToRegex(glob) {
  // Brackets are literal: stage-fork-tree.sh escapes "[" before rsync reads it.
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; }
    else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return re;
}

/**
 * True only when rsync would certainly leave this path out of the fork tree.
 * A pattern without a slash matches a name at any depth, as rsync does. A
 * pattern with one is matched from the repository root only: rsync would also
 * match it deeper, so this can call a path shipped that is not, and the gate
 * then runs for nothing, but it never calls a shipped path excluded.
 */
export function surelyExcluded(p, patterns) {
  const parts = p.split("/");
  for (const raw of patterns) {
    const dirOnly = raw.endsWith("/");
    const anchored = raw.startsWith("/");
    const pat = raw.replace(/^\//, "").replace(/\/$/, "");
    if (!pat) continue;
    const re = new RegExp(`^${globToRegex(pat)}$`);
    if (!pat.includes("/") && !anchored) {
      // A name: any ancestor directory, or (for a file pattern) the file itself.
      const names = dirOnly ? parts.slice(0, -1) : parts;
      if (names.some((n) => re.test(n))) return true;
      continue;
    }
    // A path: the path itself or one of its ancestor directories, from the root.
    for (let i = 1; i <= parts.length; i++) {
      if (dirOnly && i === parts.length) break;
      if (re.test(parts.slice(0, i).join("/"))) return true;
    }
  }
  return false;
}

/** The script file a gate's npm command runs, to always run a gate whose own code changed. */
export function gateScript(command) {
  return command.match(/node\s+(?:--\S+\s+)*(scripts\/\S+\.mjs)/)?.[1] ?? null;
}

/**
 * Which gates to run for these changed files, each with the reason. Pure, so
 * every rule is tested without running a gate.
 */
export function gatePlan(gates, scripts, changed, { excluded = () => false } = {}) {
  return gates.map((gate) => {
    const script = gateScript(scripts[gate] ?? "");
    // A gate in a folder of its own (scripts/design/) keeps its baseline there.
    const home = script && path.dirname(script) !== "scripts" ? `${path.dirname(script)}/` : null;
    if (script && changed.some((p) => p === script || (home && p.startsWith(home)))) {
      return { gate, run: true, why: "its own script changed" };
    }
    switch (gate) {
      case "check:fork-safe": {
        if (changed.some((p) => FORK_MACHINERY.some((re) => re.test(p)))) return { gate, run: true, why: "the fork's own machinery changed" };
        const shipped = changed.filter((p) => !excluded(p));
        return shipped.length
          ? { gate, run: true, why: `${shipped[0]} ships to the fork` }
          : { gate, run: false, why: "every changed file is excluded from the fork" };
      }
      case "check:design":
      case "check:utilities-scope": {
        const hit = changed.find(isStyleOrUiInput) ?? changed.find((p) => p.startsWith("scripts/design/"));
        return hit ? { gate, run: true, why: `${hit} is a stylesheet, component or asset it reads` } : { gate, run: false, why: "no stylesheet, app code or public asset changed" };
      }
      case "check:lint-warnings": {
        if (changed.includes("scripts/lint-warning-baseline.json")) return { gate, run: true, why: "its baseline changed" };
        const lintable = changed.filter(isLintable);
        return lintable.length
          ? { gate, run: "fast", why: `${lintable.length} lintable file(s) changed`, files: lintable }
          : { gate, run: false, why: "no lintable file changed, so no warning count can move" };
      }
      default:
        return { gate, run: true, why: "" };
    }
  });
}

/** The gate names in package.json's check:gates, in order. */
export function gatesOf(scripts) {
  return Object.keys(gateArgs(scripts));
}

/**
 * Each gate's arguments as check:gates passes them, by name: the tracing gate
 * runs as `check:tracing -- --if-built`, and without them it fails on a tree
 * that has not been built.
 */
export function gateArgs(scripts) {
  const out = {};
  for (const step of scripts["check:gates"].split("&&")) {
    const words = step.trim().replace(/^npm run /, "").split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const dash = words.indexOf("--");
    out[words[0]] = dash >= 0 ? words.slice(dash + 1) : [];
  }
  return out;
}

/** The changed files the pre-push hook listed, or null when there is no list. */
export function readChanged(env = process.env) {
  const file = env.EDGE8_PUSH_CHANGED;
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
}

// On Windows npm is npm.cmd, which Node spawns only through a shell (the same
// fix scripts/check-lint-warnings.mjs carries).
const shell = process.platform === "win32";

function runGate(gate, extra = []) {
  const r = spawnSync("npm", ["run", "-s", gate, ...(extra.length ? ["--", ...extra] : [])], { cwd: ROOT, stdio: "inherit", shell });
  return r.status ?? 1;
}

/**
 * The fast path for check:lint-warnings. The ratcheted rules look at one file
 * at a time, so a warning count can only move where a file changed: when the
 * changed files carry none of the baseline's rules, the total cannot have risen.
 * When they do carry one, the whole count runs, because only it knows whether
 * the warning is new or one the baseline already holds.
 */
function lintWarningsFast(files) {
  const existing = files.filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (existing.length === 0) return { done: true, note: "the changed lintable files were deleted" };
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/lint-warning-baseline.json"), "utf8")).warnings;
  const out = path.join(os.tmpdir(), `run-gates-eslint-${process.pid}.json`);
  try {
    execFileSync("npx", ["eslint", "--cache", "--cache-strategy", "content", "--cache-location", "node_modules/.cache/eslint/", "--format", "json", "--output-file", out, ...existing], { cwd: ROOT, stdio: ["ignore", "ignore", "pipe"], shell });
  } catch {
    // Errors are the lint gate's business; only a missing report is a failure here.
  }
  if (!fs.existsSync(out)) return { done: false, note: "eslint wrote no report" };
  const counts = countWarnings(JSON.parse(fs.readFileSync(out, "utf8")));
  fs.rmSync(out, { force: true });
  const hit = Object.keys(baseline).filter((rule) => (counts[rule] ?? 0) > 0);
  return hit.length ? { done: false, note: `${hit.join(", ")} in a changed file` } : { done: true, note: `no ratcheted warning in ${existing.length} changed file(s)` };
}

function main() {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  const gates = gatesOf(scripts);
  const args = gateArgs(scripts);
  const changed = readChanged();
  const patterns = readExcludes();
  const plan = changed
    ? gatePlan(gates, scripts, changed, { excluded: (p) => surelyExcluded(p, patterns) })
    : gates.map((gate) => ({ gate, run: true, why: "no changed-file list" }));
  const skipped = plan.filter((g) => g.run === false);
  console.log(`run-gates: ${plan.length - skipped.length} of ${plan.length} gate(s)${changed ? ` for ${changed.length} changed file(s)` : ", no changed-file list"}`);
  for (const g of skipped) console.log(`run-gates: skip ${g.gate}: ${g.why}`);
  if (process.argv.includes("--plan")) {
    for (const g of plan.filter((x) => x.run)) console.log(`run-gates: run ${g.gate}${g.why ? `: ${g.why}` : ""}`);
    return 0;
  }
  for (const g of plan) {
    if (g.run === false) continue;
    if (g.run === "fast") {
      const fast = lintWarningsFast(g.files);
      console.log(`run-gates: ${g.gate}: ${fast.note}${fast.done ? "" : ", counting the whole tree"}`);
      if (fast.done) continue;
    }
    const status = runGate(g.gate, args[g.gate]);
    if (status !== 0) {
      console.error(`run-gates: ${g.gate} failed`);
      return status;
    }
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
