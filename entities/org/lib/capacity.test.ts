import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));

import { ReadFailure } from "@/kernel/data/read";
import { loadCapacity } from "./capacity";

const MON = "2026-09-28";

function scriptAll(over: { roles?: unknown; commitments?: unknown; rolesError?: { message: string } } = {}) {
  script("capacity_roles", over.rolesError ? { error: over.rolesError } : {
    data: over.roles ?? [
      { id: "r1", name: "Designer", position_id: null, hours_per_week: "40.00", effective_from: "2026-01-05" },
      { id: "r2", name: "Engineer", position_id: "pos-1", hours_per_week: 80, effective_from: "2026-01-05" },
    ],
  });
  script("capacity_commitments", {
    data: over.commitments ?? [
      { id: "c1", role_id: "r1", company_id: "co-1", hours_per_week: 12.5, starts_on: "2026-10-05", ends_on: null, source: "deal", note: null, company: { name: "Acme Fixtures" } },
      { id: "c2", role_id: "r2", company_id: null, hours_per_week: 8, starts_on: "2026-09-01", ends_on: "2026-12-31", source: "manual", note: "Ops", company: null },
      // Its role is archived, so it is not among the roles above.
      { id: "c3", role_id: "r-archived", company_id: null, hours_per_week: 5, starts_on: MON, ends_on: null, source: "manual", note: null, company: null },
    ],
  });
  script("positions", { data: [{ id: "pos-1", title: "Software Engineer" }] });
  script("companies", { data: [{ id: "co-1", name: "Acme Fixtures" }] });
}

beforeEach(() => resetFake());

describe("loadCapacity", () => {
  it("maps rows to the model's shapes, with hours as numbers and internal work as no company", async () => {
    scriptAll();
    const data = await loadCapacity(MON);
    expect(data.roles).toEqual([
      { id: "r1", name: "Designer", positionId: null, hoursPerWeek: 40, effectiveFrom: "2026-01-05" },
      { id: "r2", name: "Engineer", positionId: "pos-1", hoursPerWeek: 80, effectiveFrom: "2026-01-05" },
    ]);
    expect(data.commitments.map((c) => [c.id, c.companyName, c.hoursPerWeek])).toEqual([
      ["c1", "Acme Fixtures", 12.5],
      ["c2", null, 8],
    ]);
    expect(data.positions).toEqual([{ id: "pos-1", label: "Software Engineer" }]);
    expect(data.companies).toEqual([{ id: "co-1", label: "Acme Fixtures" }]);
  });

  it("drops the commitments of an archived role along with it", async () => {
    scriptAll();
    const data = await loadCapacity(MON);
    expect(data.commitments.some((c) => c.roleId === "r-archived")).toBe(false);
  });

  it("reads only live rows, and only commitments that have not ended before the week", async () => {
    scriptAll();
    await loadCapacity(MON);
    const byTable = (t: string) => calls.find((c) => c.table === t)!;
    expect(byTable("capacity_roles").filters).toContainEqual(["is", "archived_at", null]);
    expect(byTable("capacity_commitments").filters).toContainEqual(["is", "archived_at", null]);
    expect(byTable("capacity_commitments").filters).toContainEqual(["or", `ends_on.is.null,ends_on.gte.${MON}`]);
  });

  it("raises a failed read instead of rendering an empty, and falsely roomy, forecast", async () => {
    scriptAll({ rolesError: { message: "connection reset" } });
    await expect(loadCapacity(MON)).rejects.toBeInstanceOf(ReadFailure);
  });
});
