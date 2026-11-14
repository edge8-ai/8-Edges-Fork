import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applySql, fileForVersion, ledgerHas } from "./apply-migration.mjs";

describe("fileForVersion", () => {
  it("names exactly one file, and says why when it cannot", () => {
    const dir = mkdtempSync(join(tmpdir(), "apply-migration-test-"));
    writeFileSync(join(dir, "20261003160000_ddl_guard.sql"), "select 1;");
    writeFileSync(join(dir, "20261003170000_a.sql"), "select 1;");
    writeFileSync(join(dir, "20261003170000_b.sql"), "select 1;");
    expect(fileForVersion(dir, "20261003160000")).toEqual({ file: "20261003160000_ddl_guard.sql" });
    expect(fileForVersion(dir, "20261003170000").error).toMatch(/2 files share/);
    expect(fileForVersion(dir, "20261003180000").error).toMatch(/no supabase\/migrations/);
    expect(fileForVersion(dir, "ddl_guard").error).toMatch(/not a 14-digit/);
  });
});

describe("applySql", () => {
  it("declares the migration before the body and resets it after, in one session", () => {
    const sql = applySql("20261003160000", "create table company_os.x (id int);");
    expect(sql.startsWith("set edge8.migration = '20261003160000';\n")).toBe(true);
    expect(sql).toContain("create table company_os.x (id int);");
    expect(sql.trimEnd().endsWith("reset edge8.migration;")).toBe(true);
  });
});

describe("ledgerHas", () => {
  it("reads the CLI's JSON and finds the version only when it is there", () => {
    const out = 'Initialising login role...\n{"boundary":"x","rows":[{"version":"20261003160000"}],"warning":"..."}';
    expect(ledgerHas(out, "20261003160000")).toBe(true);
    expect(ledgerHas(out, "20261003170000")).toBe(false);
    expect(ledgerHas('{"boundary":"x","rows":[],"warning":"..."}', "20261003160000")).toBe(false);
  });
});
