// Exercises scripts/check-migrations.mjs against throwaway fixture trees, so
// the assertions hold however many migrations the real tree accumulates; the
// real-tree check is the `check:migrations` gate itself.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMigrations } from "./check-migrations.mjs";

const tmpDirs = [];

function fixture(names, grandfathered = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "migrations-"));
  tmpDirs.push(root);
  fs.mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(root, "supabase", "migrations", n), "select 1;");
  fs.writeFileSync(
    path.join(root, "scripts", "migration-timestamp-allowlist.json"),
    JSON.stringify({ grandfathered }),
  );
  return root;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("checkMigrations", () => {
  it("passes when every prefix is unique", () => {
    const root = fixture(["20260101000000_a.sql", "20260101000001_b.sql"]);
    expect(checkMigrations(root).errors).toEqual([]);
  });

  it("fails on a new collision", () => {
    const root = fixture(["20260101000000_a.sql", "20260101000000_b.sql"]);
    const { errors } = checkMigrations(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/20260101000000 is used by 2 files/);
  });

  it("tolerates a grandfathered collision", () => {
    const root = fixture(["20260101000000_a.sql", "20260101000000_b.sql"], ["20260101000000"]);
    expect(checkMigrations(root).errors).toEqual([]);
  });

  it("demands removal of an allowlist entry that no longer collides", () => {
    const root = fixture(["20260101000000_a.sql"], ["20260101000000"]);
    expect(checkMigrations(root).errors[0]).toMatch(/no longer collides/);
  });

  it("rejects a file without a timestamp prefix", () => {
    const root = fixture(["fix.sql"]);
    expect(checkMigrations(root).errors[0]).toMatch(/14-digit timestamp/);
  });
});
