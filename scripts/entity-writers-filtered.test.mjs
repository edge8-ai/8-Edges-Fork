// Every `update*` / `upsert*`-free `delete*` writer the entities and the kernel
// export returns a bare PostgREST builder: `updateCompanies(patch)` is
// `companyOs.from("companies").update(patch)` with no filter, so that the
// caller keeps its own `.eq(...)`. That is the design (ME-13) — and its edge:
// a caller that awaits the verb without a filter updates or deletes the whole
// table, and nothing in the writer can stop it. This test is the stop. It
// finds every call of an `update*` or `delete*` writer in the tree and fails
// when the statement carries no filter method before it ends.
//
// Textual, like the gates: the statement is the text from the call to the
// first `;` at paren depth zero. A dispatcher that wraps a writer (the
// archivable-table switch in company-os, the /team own-service switch) takes
// the row id and filters inside the same statement for exactly this reason.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = ["app", "entities", "kernel"];
const FILTERS = /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|match|not|or|filter|textSearch)\s*\(/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");
}

/** The exported `update*` / `delete*` writer names across every writes.ts. */
export function writerNames(root = ROOT) {
  const files = SCAN.flatMap((d) => walk(path.join(root, d))).filter((f) => /\/writes\.ts$/.test(f));
  const names = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, "utf8").matchAll(/export const ((?:update|delete)[A-Z]\w*)\s*=/g)) names.add(m[1]);
  }
  return [...names].sort();
}

/** The statement text starting at `start`, to the first `;` at depth zero. */
function statementFrom(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (depth === 0 && ch === ";") return source.slice(start, i);
  }
  return source.slice(start);
}

/** Every call of a writer with no filter in its statement: "file:line writer". */
export function unfilteredWriterCalls(root = ROOT, names = writerNames(root)) {
  const out = [];
  if (names.length === 0) return out;
  const call = new RegExp(`\\b(${names.join("|")})\\s*\\(`, "g");
  for (const file of SCAN.flatMap((d) => walk(path.join(root, d)))) {
    if (/\/writes\.ts$/.test(file)) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    for (const m of source.matchAll(call)) {
      // The writer's own name inside an import list is not a call.
      const before = source.slice(0, m.index);
      if (/import\s*\{[^}]*$/.test(before)) continue;
      const statement = statementFrom(source, m.index);
      if (FILTERS.test(statement)) continue;
      const line = before.split("\n").length;
      out.push(`${path.relative(root, file)}:${line} ${m[1]}`);
    }
  }
  return out.sort();
}

describe("entity writers are always filtered", () => {
  it("knows the update and delete writers", () => {
    const names = writerNames();
    expect(names).toContain("updateCompanies");
    expect(names).toContain("deletePeople");
  });

  it("finds no update or delete writer awaited without a filter", () => {
    expect(unfilteredWriterCalls()).toEqual([]);
  });
});
