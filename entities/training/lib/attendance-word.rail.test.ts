import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The register's rules hold only while every word goes through attendance-word
// (A.40). Before it, three writers set a row's status, and the one that forgot
// to record its source let a transcript overwrite a member's correction. A new
// writer is most likely to arrive as a copy of an old one, so any statement
// outside the module that updates a register row's status or source, or writes
// a review, fails here. Changing who is on a session (inserting a row, setting
// removed_at) stays with the roster code; putting someone back spreads the
// module's BLANK_WORD rather than spelling a status of its own.

// Every tree that can hold code reaching the database: the entities, the
// composition root, the kernel and the scripts.
const root = process.cwd();
const TREES = ["entities", "app", "kernel", "scripts"];
const MODULE = join("entities", "training", "lib", "attendance-word.ts");
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.(ts|tsx|mjs|js)$/.test(name)) files.push(path);
  }
};
for (const tree of TREES) walk(join(root, tree));

/** Each statement that starts at `.from("<table>")`, in either quote, up to the end of that statement. */
function statements(source: string, table: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const marker = new RegExp(`\\.from\\(\\s*["'\`]${table}["'\`]\\s*\\)`, "g");
  for (const m of source.matchAll(marker)) {
    const at = m.index ?? 0;
    const end = source.indexOf(";", at);
    out.push({ text: source.slice(at, end === -1 ? undefined : end), line: source.slice(0, at).split("\n").length });
  }
  return out;
}

describe("every word on a training register", () => {
  const outside = files.filter((f) => !f.endsWith(MODULE));
  const where = (f: string, line: number) => `${f.slice(root.length + 1)}:${line}`;

  it("finds the module and the writers it is meant to watch", () => {
    // A walk that finds nothing would pass every rule below by reading nothing.
    expect(files.some((f) => f.endsWith(MODULE))).toBe(true);
    expect(outside.filter((f) => statements(readFileSync(f, "utf8"), "training_attendance").length > 0).length).toBeGreaterThan(3);
  });

  it("sets a row's status or source only through attendance-word", () => {
    const byHand = outside.flatMap((f) =>
      statements(readFileSync(f, "utf8"), "training_attendance")
        .filter(({ text }) => /\.(update|upsert)\(/.test(text) && /["']?\b(status|source)["']?\s*:/.test(text))
        .map(({ line }) => where(f, line)),
    );
    expect(byHand).toEqual([]);
  });

  it("writes a review only through attendance-word", () => {
    const byHand = outside.flatMap((f) =>
      statements(readFileSync(f, "utf8"), "training_reviews")
        .filter(({ text }) => /\.(insert|update|upsert|delete)\(/.test(text))
        .map(({ line }) => where(f, line)),
    );
    expect(byHand).toEqual([]);
  });
});
