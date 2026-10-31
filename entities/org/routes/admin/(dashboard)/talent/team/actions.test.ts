import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";

// W.118.1. The team roster edits a member's LinkedIn on their people row, and
// the contact views draw it as an href: a value that is not a link is refused
// before anything is read or written.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
// What the signed-in admin holds, as the resolver would answer.
let held: string[] = [];
vi.mock("@/kernel/identity/access-request", () => ({
  requirePermission: vi.fn(async () => ({ user: { email: "admin@example.test" }, may: (p: string) => held.includes(p) })),
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn(async () => {}) }));
vi.mock("@/kernel/messaging/email", () => ({ sendTransactionalEmail: vi.fn() }));
vi.mock("@/entities/retreats", () => ({ setPersonAvatar: vi.fn() }));
vi.mock("@/entities/crm", () => ({ upsertPeopleSensitive: vi.fn() }));
vi.mock("@/entities/org/lib/compensation", () => ({ saveSalaryChange: vi.fn() }));
vi.mock("@/entities/team", () => ({ openReviewCycle: vi.fn(), reviewSurveySlug: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({
  updatePeople: (row: unknown) => builderFor("people").update(row),
  updateTeamMembers: (row: unknown) => builderFor("team_members").update(row),
}));

import { saveSalaryChange, saveSensitiveDetails, updateTeamMember } from "./actions";
import { upsertPeopleSensitive } from "@/entities/crm";
import { saveSalaryChange as recordSalaryChange } from "@/entities/org/lib/compensation";

const peopleWrites = () =>
  calls.filter((c) => c.table === "people").map((c) => c.payloads[0] as Record<string, unknown>);

beforeEach(() => {
  resetFake();
  held = [];
  vi.mocked(upsertPeopleSensitive).mockReset();
  vi.mocked(recordSalaryChange).mockReset();
});

// AE.1 (ADR 0014): pay and personal records are atoms of their own, which
// Super Admin holds by declaration. Opening the people page is not enough.
describe("the sensitive atoms", () => {
  const salary = { salaryVnd: 1, salaryUsdCents: 1, effectiveFrom: "2026-10-01" };

  it("refuses an Admin people.identity: the personal record is never written", async () => {
    held = ["org.people", "surface.admin"];
    expect(await saveSensitiveDetails("p1", {} as never)).toEqual({ ok: false, error: "Not authorized." });
    expect(upsertPeopleSensitive).not.toHaveBeenCalled();
  });

  it("admits a holder of people.identity", async () => {
    held = ["org.people", "people.identity"];
    vi.mocked(upsertPeopleSensitive).mockResolvedValue({ ok: true } as never);
    expect(await saveSensitiveDetails("p1", {} as never)).toEqual({ ok: true, message: "Saved." });
    expect(upsertPeopleSensitive).toHaveBeenCalledWith("p1", {}, "admin@example.test");
  });

  it("refuses an Admin people.pay: no salary is recorded", async () => {
    held = ["org.people", "surface.admin", "people.identity"];
    expect(await saveSalaryChange("tm1", salary)).toEqual({ ok: false, error: "Not authorized." });
    expect(recordSalaryChange).not.toHaveBeenCalled();
  });

  it("lets a holder of people.pay past the gate", async () => {
    held = ["org.people", "people.pay"];
    vi.mocked(recordSalaryChange).mockResolvedValue({ ok: false, error: "stop here" } as never);
    expect(await saveSalaryChange("tm1", salary)).toEqual({ ok: false, error: "stop here" });
    expect(recordSalaryChange).toHaveBeenCalled();
  });
});

describe("updateTeamMember · LinkedIn", () => {
  it("stores a schemeless profile as https, and clears on empty", async () => {
    // Each save reads the member's person_id, then writes the people row.
    script("team_members", { data: { person_id: "p1" } }, { data: { person_id: "p1" } });
    script("people", {}, {});
    expect(await updateTeamMember("tm1", { linkedin_url: "linkedin.com/in/someone", city: "Saigon" })).toEqual({ ok: true });
    expect(await updateTeamMember("tm1", { linkedin_url: "" })).toEqual({ ok: true });
    expect(peopleWrites().map((w) => [w.linkedin_url, w.city])).toEqual([
      ["https://linkedin.com/in/someone", "Saigon"],
      [null, undefined],
    ]);
  });

  it("refuses a value that is not a link and touches nothing", async () => {
    expect(await updateTeamMember("tm1", { city: "Saigon", linkedin_url: "javascript:alert(1)" })).toEqual({
      ok: false,
      error: LINKEDIN_NOT_A_LINK,
    });
    expect(calls).toHaveLength(0);
  });
});
