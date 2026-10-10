import { beforeEach, describe, expect, it, vi } from "vitest";

// The chain the helper builds, recorded so the test can assert the filters the
// five call sites used to carry by hand.
let chain: { method: string; args: unknown[] }[] = [];
let response: { data: unknown; error: { message: string } | null } = { data: null, error: null };

const builder: Record<string, unknown> = {};
for (const m of ["eq", "in", "neq", "is", "order", "limit"]) {
  builder[m] = (...args: unknown[]) => {
    chain.push({ method: m, args });
    return builder;
  };
}
builder.maybeSingle = () => {
  chain.push({ method: "maybeSingle", args: [] });
  return Promise.resolve(response);
};
// A list read awaits the builder itself rather than narrowing to one row.
builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);

const selectAiPrograms = vi.fn();
vi.mock("./reads", () => ({ selectAiPrograms: (...a: unknown[]) => selectAiPrograms(...a) }));

import { liveProgramsForCompany, programInCompanies, programInCompany } from "./program-scope";

beforeEach(() => {
  chain = [];
  response = { data: null, error: null };
  selectAiPrograms.mockReset();
  selectAiPrograms.mockImplementation((...args: unknown[]) => {
    chain.push({ method: "select", args });
    return builder;
  });
});

describe("programInCompanies", () => {
  it("returns the program as a typed ref when it is in scope", async () => {
    response = { data: { id: "prog-1", company_id: "co-1" }, error: null };
    expect(await programInCompanies("prog-1", ["co-1", "co-2"])).toEqual({
      ok: true,
      program: { id: "prog-1", companyId: "co-1" },
    });
  });

  it("asks for the columns and the scope filter the callers used to write out", async () => {
    await programInCompanies("prog-1", ["co-1", "co-2"]);
    expect(chain).toEqual([
      { method: "select", args: ["id, company_id"] },
      { method: "eq", args: ["id", "prog-1"] },
      { method: "in", args: ["company_id", ["co-1", "co-2"]] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("matches nothing on an empty scope, without a read", async () => {
    expect(await programInCompanies("prog-1", [])).toEqual({ ok: true, program: null });
    expect(selectAiPrograms).not.toHaveBeenCalled();
  });

  it("reports a read failure instead of answering 'not in scope'", async () => {
    // The point of the error channel: callers used to turn a database error
    // into "That program does not belong to this company."
    response = { data: null, error: { message: "connection reset" } };
    expect(await programInCompanies("prog-1", ["co-1"])).toEqual({ ok: false, error: "connection reset" });
  });

  it("distinguishes genuinely-not-found from failed", async () => {
    response = { data: null, error: null };
    expect(await programInCompanies("prog-1", ["co-1"])).toEqual({ ok: true, program: null });
  });
});

describe("programInCompany", () => {
  it("filters on the one company with eq, not in", async () => {
    await programInCompany("prog-1", "co-1");
    expect(chain).toEqual([
      { method: "select", args: ["id, company_id"] },
      { method: "eq", args: ["id", "prog-1"] },
      { method: "eq", args: ["company_id", "co-1"] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  it("matches nothing when either id is blank, without a read", async () => {
    expect(await programInCompany("", "co-1")).toEqual({ ok: true, program: null });
    expect(await programInCompany("prog-1", "")).toEqual({ ok: true, program: null });
    expect(selectAiPrograms).not.toHaveBeenCalled();
  });
});

describe("liveProgramsForCompany", () => {
  it("names the company's programmes and leaves the archived ones out", async () => {
    response = {
      data: [
        { id: "prog-1", company_id: "co-1", name: "Install 8 Edges OS" },
        { id: "prog-2", company_id: "co-1", name: "Revenue Cockpit" },
      ],
      error: null,
    };
    expect(await liveProgramsForCompany("co-1")).toEqual({
      ok: true,
      programs: [
        { id: "prog-1", companyId: "co-1", name: "Install 8 Edges OS" },
        { id: "prog-2", companyId: "co-1", name: "Revenue Cockpit" },
      ],
    });
    // The "live" filter, spelled the same way the four existing call sites
    // spell it. A caller assembling this itself is how one of them would start
    // counting archived programmes.
    expect(chain).toContainEqual({ method: "neq", args: ["status", "archived"] });
  });

  it("says a read failed rather than reporting no programmes", async () => {
    // The permissive branch is the dangerous one here: "no programmes" makes a
    // subscriber do nothing quietly, which is indistinguishable from success.
    response = { data: null, error: { message: "connection reset" } };
    expect(await liveProgramsForCompany("co-1")).toEqual({ ok: false, error: "connection reset" });
  });

  it("reads nothing for a blank company", async () => {
    expect(await liveProgramsForCompany("")).toEqual({ ok: true, programs: [] });
    expect(selectAiPrograms).not.toHaveBeenCalled();
  });
});
