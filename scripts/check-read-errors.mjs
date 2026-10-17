// Fails when a Supabase read never binds its `error`, and ratchets the number
// of reads that bind it only to log it (A.12).
//
// CLAUDE.md Rule 2 — "Check `error` on every Supabase call" — was a mechanical
// rule living in a doc, which by the repo's own note is a rule enforced
// nowhere: none of the other check scripts and no ESLint rule inspects whether
// an error is acted on. The 19 Sep 2026 architecture review found five reads
// that did not bind `error` at all, one of which (`isHiringManager`) made a
// capability answer "no" on a failed read and silently removed a section from a
// person's sidebar.
//
// Two classes, deliberately treated differently:
//
//   UNBOUND — the read destructures without `error`. The failure is not even
//     observable. Hard failure; the allowlist below carries the few places
//     where it is genuinely intended, each with a reason.
//
//   LOGGED-ONLY — the error is bound and passed to console.error, then a
//     default is returned. Sometimes right, often not, and never visible in the
//     signature. Ratcheted against a baseline that may only shrink, so the
//     existing ones can be converted to kernel/data/read's `mustRead`/`readOr`
//     over time without blocking today's work, and a new one cannot be added.
//
// Detection is textual and deliberately blunt, in the style of
// check-table-ownership.mjs. It recognises a read as an `await` of either a
// PostgREST builder method (`.select(`, `.insert(`, ...) or a door helper
// (`selectFoo(`, `updateBar(`, ...) — the latter matters because the helper's
// name has no dot before `select`, which is how `isHiringManager` escaped an
// earlier grep.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, "..");
export const BASELINE_FILE = "scripts/read-errors-baseline.json";
const ROOTS = ["app", "kernel", "entities"];
const SKIP = /(\.test\.tsx?|\.d\.ts|database\.types\.ts|[\\/]testing[\\/])/;

// A read: an awaited PostgREST builder call, or an awaited door helper.
const ACCESS = /\.(select|insert|update|upsert|delete|rpc)\(|\b(select|insert|update|upsert|delete)[A-Z]\w*\(/;

// Reads that intentionally do not observe their error, each with the reason.
// A new entry is a decision, not a formality.
export const UNBOUND_ALLOWLIST = {
  "entities/campaigns/crons/email-campaign-send.ts": [
    "First names for the greeting. The enclosing try/catch and comment state it: a failed read costs the personalisation (\"Hi there\"), never the send.",
  ],
};

/**
 * The object patterns a `const ... = await ...` statement destructures into.
 *
 * `const { data, error } = await …`                 → ["data, error"]
 * `const [{ data }, { data: x }] = await Promise…`  → ["data", "data: x"]
 * `const [rows, count] = await Promise…`            → []   (no read is destructured)
 *
 * The array form is why this function exists. The detector used to be a single
 * regex requiring `const {` immediately before the await, so a read pulled out
 * of a `Promise.all` was invisible to it: not classifiable as unbound, not
 * counted toward the ratchet, and reported as nothing at all. Forty-eight such
 * statements were in the tree when this was found, two of them handing a failed
 * read to a coaching prompt as "(no FAST goals set yet)" (A.23, K.69).
 *
 * A bare identifier inside the array is ignored on purpose: `const [{ data },
 * edges] = await Promise.all([read, helper()])` has exactly one read in it.
 */
export function bindingPatterns(stmt) {
  const split = stmt.split(/=\s*await\s/);
  if (split.length < 2) return [];
  // The binding target must sit IMMEDIATELY before the `= await`. Without that
  // anchor `for (const { id } of rows)` three lines above a read matched, and
  // the loop variable was reported as an unbound read (seen while building
  // this: qbo-invoice-sync.ts:89).
  const m = split[0].match(/\bconst\s*(\{[^}]*\}|\[[^\]]*\])\s*$/);
  if (!m) return [];
  // …and it must be the `const` on the statement's FIRST line. A `for (const
  // { id } of rows) {` header carries no semicolon of its own, so the
  // multi-line lookahead runs straight through it into the read on the next
  // line; without this the loop header is reported as that read, at the wrong
  // line number, accusing a line that reads nothing. The bound version of the
  // same shape hid this, because a bound read produces no report at all.
  const firstLineEnd = split[0].indexOf("\n");
  if (firstLineEnd !== -1 && m.index > firstLineEnd) return [];
  const target = m[1];
  if (target.startsWith("{")) return [target.slice(1, -1)];
  return [...target.matchAll(/\{([^}]*)\}/g)].map((g) => g[1]);
}

export function scan(root = DEFAULT_ROOT) {
  const unbound = [];
  const loggedOnly = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(e.name) || SKIP.test(full)) continue;
      const rel = path.relative(root, full).replace(/\\/g, "/");
      const lines = fs.readFileSync(full, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        // The statement must BEGIN on this line, or a `try {` three lines above
        // a read would be reported as the read — and the same statement would
        // be reported once per line above it.
        if (!/\bconst\s*[{[]/.test(lines[i])) continue;
        // The statement may wrap over several lines; stop at its semicolon.
        const stmt = lines.slice(i, i + 14).join("\n").split(";")[0];
        const patterns = bindingPatterns(stmt);
        if (!patterns.length) continue;
        if (!ACCESS.test(stmt)) continue;
        // Every object pattern on the left is one awaited read. A statement
        // where ANY of them fails to bind `error` has an unobservable failure,
        // so the whole statement is unbound — reporting the first is enough to
        // send a human to the line.
        const blind = patterns.find((b) => !/\berror\b/i.test(b));
        if (blind !== undefined) {
          // The shape decides how it is treated. See compare().
          const shape = /\bconst\s*\[/.test(lines[i]) ? "array" : "object";
          unbound.push({ file: rel, line: i + 1, text: lines[i].trim(), shape });
          continue;
        }
        const binds = patterns.join(", ");
        const em = binds.match(/error\s*:\s*([A-Za-z_$][\w$]*)/) || binds.match(/\b(error)\b/);
        if (!em) continue;
        const name = em[1];
        const after = lines.slice(i, i + 16).join("\n");
        const uses = [...after.matchAll(new RegExp(`\\b${name}\\b`, "g"))].length;
        // Bound, guarded, logged — and used nowhere else in the statement's
        // neighbourhood, so the value the caller returns is a default.
        if (new RegExp(`if\\s*\\(\\s*${name}\\s*\\)\\s*console\\.error\\(`).test(after) && uses <= 3) {
          loggedOnly.push({ file: rel, line: i + 1 });
        }
      }
    }
  };
  for (const r of ROOTS) if (fs.existsSync(path.join(root, r))) walk(path.join(root, r));
  return { unbound, loggedOnly };
}

/** Pure comparison, so the test can drive it without touching the tree. */
export function compare({ unbound, loggedOnly }, baseline, allowlist = UNBOUND_ALLOWLIST) {
  const errors = [];
  // Two shapes, treated differently, and the reason is what each one means.
  //
  // `const { data } = await …` has always been visible here, so an unbound one
  // is new code breaking a rule the gate was already enforcing. Hard failure.
  //
  // `const [{ data }, …] = await Promise.all(…)` was invisible until A.23 fixed
  // the detector, and widening it surfaced two dozen reads that have been there
  // for months. Hard-failing those blocks every branch until somebody triages
  // code they did not write, so they are ratcheted instead — shrink-only, the
  // same answer this script already gives for logged-only reads, and for the
  // same reason: the existing ones get converted over time and a new one cannot
  // be added. The count prints on every run so it cannot quietly become normal.
  const arrayUnbound = unbound.filter((u) => u.shape === "array" && !allowlist[u.file]);
  for (const u of unbound) {
    if (allowlist[u.file] || u.shape === "array") continue;
    errors.push(
      `${u.file}:${u.line} reads without binding \`error\`, so a failure is indistinguishable from an empty result.\n` +
        `    ${u.text}\n` +
        `    Use mustRead/mustRows/mustCount from @/kernel/data/read when a failure would be a wrong answer,\n` +
        `    or readOr/countOr when the fallback is genuinely acceptable. If it is deliberate, add it to\n` +
        `    UNBOUND_ALLOWLIST in ${path.basename(fileURLToPath(import.meta.url))} with the reason.`,
    );
  }
  const arrayCeiling = baseline.unboundInPromiseAll ?? 0;
  if (arrayUnbound.length > arrayCeiling) {
    errors.push(
      `${arrayUnbound.length} reads destructured out of a Promise.all never bind \`error\`, above the baseline of ${arrayCeiling}.\n` +
        `    ${arrayUnbound.slice(0, 3).map((u) => `${u.file}:${u.line}`).join(", ")}${arrayUnbound.length > 3 ? ", …" : ""}\n` +
        `    This shape was invisible to this gate until A.23. The baseline may shrink, never grow:\n` +
        `    convert one with mustRows/readOr and lower it, rather than adding another.`,
    );
  }
  const ceiling = baseline.loggedOnly ?? 0;
  if (loggedOnly.length > ceiling) {
    errors.push(
      `${loggedOnly.length} reads log their error and return a default, above the baseline of ${ceiling}.\n` +
        `    A logged error is not a handled error: the caller receives the same value an empty table produces.\n` +
        `    Use @/kernel/data/read to say which you mean. The baseline may shrink, never grow.`,
    );
  }
  return {
    errors,
    loggedOnly: loggedOnly.length,
    unbound: unbound.length,
    unboundInPromiseAll: arrayUnbound.length,
  };
}

function main() {
  const root = DEFAULT_ROOT;
  const baselinePath = path.join(root, BASELINE_FILE);
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : { loggedOnly: 0 };
  const found = scan(root);

  if (process.argv.includes("--write-baseline")) {
    const measured = compare(found, baseline);
    const next = {
      loggedOnly: found.loggedOnly.length,
      unboundInPromiseAll: measured.unboundInPromiseAll,
    };
    for (const key of ["loggedOnly", "unboundInPromiseAll"]) {
      if (next[key] > (baseline[key] ?? Infinity)) {
        console.error(`refusing to raise ${key} from ${baseline[key]} to ${next[key]}.`);
        process.exit(1);
      }
    }
    fs.writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(
      `wrote ${BASELINE_FILE}: loggedOnly ${next.loggedOnly}, unboundInPromiseAll ${next.unboundInPromiseAll}`,
    );
    return;
  }

  const { errors, loggedOnly, unboundInPromiseAll } = compare(found, baseline);
  if (errors.length) {
    console.error("check-read-errors failed:\n");
    for (const e of errors) console.error(`  ${e}\n`);
    process.exit(1);
  }
  const ceiling = baseline.loggedOnly ?? 0;
  const arrayCeiling = baseline.unboundInPromiseAll ?? 0;
  console.log(
    `check-read-errors: no unobserved read errors; ${loggedOnly} logged-only reads (baseline ${ceiling}); ` +
      `${unboundInPromiseAll} unbound inside a Promise.all (baseline ${arrayCeiling}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
