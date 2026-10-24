// scripts/fork-tree.mjs decides when a gate may stop expecting something the
// public fork was not sent. The danger is the other direction: a test that
// answered "fork" here would quietly skip upstream checks, so both halves of
// the rule are pinned, and the real tree must answer "not the fork".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { expectedHere, isForkTree } from "./fork-tree.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let dir;
afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

function tree(files) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "fork-tree-"));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "");
  }
  return dir;
}

// The upstream repository is the one holding the sync's exclude list. The pin
// below keys its skip on that file directly, not on isForkTree, so a broken
// isForkTree cannot excuse itself; in the fork, where the answer is rightly
// true, the pin does not apply.
const UPSTREAM = fs.existsSync(path.join(ROOT, ".github/fork-sync-exclude.txt"));

describe("isForkTree", () => {
  it.runIf(UPSTREAM)("is false in this repository", () => {
    expect(isForkTree(ROOT)).toBe(false);
  });

  it("is true only with the fork's schema and without the sync's exclude list", () => {
    expect(isForkTree(tree(["supabase/01-schema.sql"]))).toBe(true);
    expect(isForkTree(tree(["supabase/01-schema.sql", ".github/fork-sync-exclude.txt"]))).toBe(false);
    expect(isForkTree(tree(["README.md"]))).toBe(false);
  });
});

describe("expectedHere", () => {
  it("expects every path upstream, present or not, so a missing file still fails there", () => {
    const root = tree([".github/fork-sync-exclude.txt"]);
    expect(expectedHere(root, "entities/htt")).toBe(true);
  });

  it("expects in the fork only what the sync sent", () => {
    const root = tree(["supabase/01-schema.sql", "entities/boards/index.ts"]);
    expect(expectedHere(root, "entities/boards")).toBe(true);
    expect(expectedHere(root, "entities/htt")).toBe(false);
  });
});
