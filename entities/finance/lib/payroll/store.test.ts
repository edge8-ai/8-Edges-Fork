import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script, scriptStorage, storageCalls, timeline } from "@/kernel/data/testing/fake-company-os";
import type { ParsedRun } from "./parse";
import type { MatchedLine } from "./match";

// Saving a payroll month (Finance → Payroll, PR #2059). Uploading a month again
// replaces it: the lines the new workbook no longer has are deleted, so a
// corrected workbook cannot leave an old line in the month's head count and
// totals. An estimate is not saved as paid, the workbook is stored only once
// the rows are, and a Storage failure is never read as "no workbook stored".

vi.mock("@/kernel/data/supabase", () => fakeSupabase());

const { savePayrollRun, workbookLink } = await import("./store");

beforeEach(resetFake);

function run(over: Partial<ParsedRun> = {}): ParsedRun {
  return { period: "2026-09-01", isEstimate: false, workingDays: 22, sourceFile: "Payroll_2026_09.xlsx", lines: [], totals: {}, unknownLabels: [], ...over };
}

const line = (teamMemberId: string) => ({ team_member_id: teamMemberId, position: "Engineer", contract_kind: "labour" }) as unknown as MatchedLine;

function save(over: Partial<ParsedRun> = {}, lines = [line("tm-1"), line("tm-2")]) {
  return savePayrollRun({ run: run(over), lines, legalEntityId: "le-1", bytes: new Uint8Array([1, 2, 3]), importedBy: "khoa@example.com" });
}

describe("savePayrollRun", () => {
  it("deletes the month's lines the new workbook no longer has, and keeps the ones it upserted", async () => {
    script("payroll_runs_sensitive", { data: { id: "run-1" } });
    script("payroll_lines_sensitive", { data: [{ id: "line-1" }, { id: "line-2" }] }, { data: null });
    scriptStorage("upload", { data: { path: "le-1/2026-09.xlsx" } });

    expect(await save()).toEqual({ runId: "run-1", lines: 2 });

    const removal = calls.filter((c) => c.table === "payroll_lines_sensitive")[1];
    expect(removal.ops[0]).toBe("delete");
    expect(removal.filters).toContainEqual(["eq", "payroll_run_id", "run-1"]);
    expect(removal.filters).toContainEqual(["not", "id", "in", "(line-1,line-2)"]);
  });

  it("saves an estimate month as a draft, and a final one as paid", async () => {
    script("payroll_runs_sensitive", { data: { id: "run-1" } }, { data: { id: "run-1" } });
    script("payroll_lines_sensitive", { data: [{ id: "line-1" }] }, { data: null }, { data: [{ id: "line-1" }] }, { data: null });
    scriptStorage("upload", { data: {} }, { data: {} });

    await save({ isEstimate: true }, [line("tm-1")]);
    await save({ isEstimate: false }, [line("tm-1")]);

    const statuses = calls.filter((c) => c.table === "payroll_runs_sensitive").map((c) => (c.payloads[0] as { status: string }).status);
    expect(statuses).toEqual(["draft", "paid"]);
  });

  it("stores the workbook only after the run and its lines are saved", async () => {
    script("payroll_runs_sensitive", { data: { id: "run-1" } });
    script("payroll_lines_sensitive", { data: [{ id: "line-1" }] }, { data: null });
    scriptStorage("upload", { data: {} });

    await save({}, [line("tm-1")]);

    const upload = storageCalls.find((c) => c.op === "upload");
    expect(upload?.args[0]).toBe("le-1/2026-09.xlsx");
    const lastRow = Math.max(...calls.map((c) => c.resolvedAt ?? 0));
    expect(upload?.resolvedAt).toBeGreaterThan(lastRow);
    expect(timeline()).toEqual(["payroll_runs_sensitive:upsert", "payroll_lines_sensitive:upsert", "payroll_lines_sensitive:delete"]);
  });

  it("leaves the stored workbook alone when the lines fail to save", async () => {
    script("payroll_runs_sensitive", { data: { id: "run-1" } });
    script("payroll_lines_sensitive", { error: { message: "lines unavailable" } });

    await expect(save()).rejects.toThrow(/Could not save the lines/);
    expect(storageCalls).toHaveLength(0);
  });

  it("says the month was saved when only the workbook failed to store", async () => {
    script("payroll_runs_sensitive", { data: { id: "run-1" } });
    script("payroll_lines_sensitive", { data: [{ id: "line-1" }] }, { data: null });
    scriptStorage("upload", { error: { message: "bucket unavailable" } });

    await expect(save({}, [line("tm-1")])).rejects.toThrow(/month was saved, but its workbook could not be stored/);
  });
});

describe("workbookLink", () => {
  it("links the stored workbook", async () => {
    scriptStorage("createSignedUrl", { data: { signedUrl: "https://storage.example/wb" } });
    expect(await workbookLink("le-1", "2026-09-01")).toEqual({ url: "https://storage.example/wb", error: null });
  });

  it("answers no workbook, with no error, for a month that has none", async () => {
    scriptStorage("createSignedUrl", { error: { message: "Object not found" } });
    expect(await workbookLink("le-1", "2026-09-01")).toEqual({ url: null, error: null });
  });

  it("reports any other Storage failure instead of claiming there is no workbook", async () => {
    scriptStorage("createSignedUrl", { error: { message: "upstream connect error" } });
    expect(await workbookLink("le-1", "2026-09-01")).toEqual({ url: null, error: "upstream connect error" });
  });
});
