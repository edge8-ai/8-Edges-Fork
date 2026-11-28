import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import { LINKEDIN_NOT_A_LINK } from "@/kernel/ui/url";
import { GOES_BY_ONE_WORD } from "@/entities/org/lib/name-parts";

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
vi.mock("@/entities/org/lib/reviews", () => ({ openReviewCycle: vi.fn(), reviewSurveySlug: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({
  updatePeople: (row: unknown) => builderFor("people").update(row),
  updateTeamMembers: (row: unknown) => builderFor("team_members").update(row),
}));

import { createAndAssignPosition, saveSalaryChange, saveSensitiveDetails, updateTeamMember } from "./actions";
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

// S.23.5. The drawer edits the three parts the shown name is built from, and a
// name edit writes people.display_name itself: the S.23 trigger leaves a
// hand-set display_name alone, which is why such names never changed.
describe("updateTeamMember · the name parts", () => {
  const memberWith = (person: Record<string, string | null>) => ({ data: { person_id: "p1", people: person } });

  it("refuses a Goes by of more than one word and touches nothing", async () => {
    expect(await updateTeamMember("tm1", { preferred_name: "Lan Vo (Kit)" })).toEqual({ ok: false, error: GOES_BY_ONE_WORD });
    expect(calls).toHaveLength(0);
  });

  it("refuses a blank given or family name and touches nothing", async () => {
    expect(await updateTeamMember("tm1", { first_name: "  " })).toEqual({ ok: false, error: "Enter a given name." });
    expect(await updateTeamMember("tm1", { last_name: "" })).toEqual({ ok: false, error: "Enter a family name." });
    expect(calls).toHaveLength(0);
  });

  it("writes the shown name from the stored parts and the edit, over a hand-set one", async () => {
    script("team_members", memberWith({ first_name: "Lan", last_name: "Trần", preferred_name: null, display_name: "Kit Tran" }));
    script("people", {});
    expect(await updateTeamMember("tm1", { preferred_name: "Kit" })).toEqual({ ok: true, shownName: "Lan Trần (Kit)" });
    expect(peopleWrites()[0]).toMatchObject({ preferred_name: "Kit", display_name: "Lan Trần (Kit)" });
  });

  it("rebuilds the shown name when the given name changes", async () => {
    script("team_members", memberWith({ first_name: "Kit", last_name: "Trần", preferred_name: "Kit", display_name: "Kit Trần" }));
    script("people", {});
    expect(await updateTeamMember("tm1", { first_name: "Lan" })).toEqual({ ok: true, shownName: "Lan Trần (Kit)" });
    expect(peopleWrites()[0]).toMatchObject({ first_name: "Lan", display_name: "Lan Trần (Kit)" });
  });

  // The drawer's Goes by fix sends all its parts in one call (useAutosave's
  // commitMany), so the action must write them together or refuse them all.
  it("saves a whole Goes by fix in one people write", async () => {
    script("team_members", memberWith({ first_name: "Kit", last_name: "Võ", preferred_name: "Lan Vo (Kit)", display_name: "Kit Võ" }));
    script("people", {});
    expect(await updateTeamMember("tm1", { first_name: "Lan", preferred_name: "Kit" })).toEqual({ ok: true, shownName: "Lan Võ (Kit)" });
    expect(peopleWrites()).toHaveLength(1);
    expect(peopleWrites()[0]).toMatchObject({ first_name: "Lan", preferred_name: "Kit", display_name: "Lan Võ (Kit)" });
  });

  it("clears a full name out of Goes by and rebuilds the shown name", async () => {
    script("team_members", memberWith({ first_name: "Lan", last_name: "Trần", preferred_name: "Lan Tran", display_name: "Lan Tran" }));
    script("people", {});
    expect(await updateTeamMember("tm1", { preferred_name: "" })).toEqual({ ok: true, shownName: "Lan Trần" });
    expect(peopleWrites()[0]).toMatchObject({ preferred_name: null, display_name: "Lan Trần" });
  });

  it("refuses a whole fix when one part is wrong, and writes none of it", async () => {
    expect(await updateTeamMember("tm1", { first_name: "Lan", preferred_name: "Lan Vo" })).toEqual({ ok: false, error: GOES_BY_ONE_WORD });
    expect(calls).toHaveLength(0);
  });

  it("leaves the shown name alone while the parts cannot make one", async () => {
    script("team_members", memberWith({ first_name: null, last_name: null, preferred_name: null, display_name: null }));
    script("people", {});
    expect(await updateTeamMember("tm1", { first_name: "Lan" })).toEqual({ ok: true });
    expect(peopleWrites()[0]).not.toHaveProperty("display_name");
  });
});

// HR.1. Level is the person's own (team_members.career_level), drawn from the
// four words its check constraint allows, so a wrong word is refused here with
// a sentence rather than by the database with an error code.
describe("updateTeamMember · Level", () => {
  const memberWrites = () => calls.filter((c) => c.table === "team_members").map((c) => c.payloads[0]);

  it("writes a known level to the person's own row", async () => {
    script("team_members", {});
    expect(await updateTeamMember("tm1", { career_level: "senior" })).toEqual({ ok: true });
    expect(memberWrites()).toEqual([{ career_level: "senior" }]);
    expect(calls[0].filters).toContainEqual(["eq", "id", "tm1"]);
  });

  it("clears the level on empty", async () => {
    script("team_members", {});
    expect(await updateTeamMember("tm1", { career_level: "" })).toEqual({ ok: true });
    expect(memberWrites()).toEqual([{ career_level: null }]);
  });

  it("refuses a word the constraint would reject and touches nothing", async () => {
    expect(await updateTeamMember("tm1", { career_level: "chief" })).toEqual({ ok: false, error: "Unknown level." });
    expect(calls).toHaveLength(0);
  });
});

// HR.1. A new title is a catalogue row named and nothing more: the level is the
// person's and "manages people" is counted, so neither is stored on the title.
describe("createAndAssignPosition", () => {
  it("inserts the title with no level or people-manager flag, then points the person at it", async () => {
    script("team_members", { data: { department_id: "d1", employment_type: "full_time" } }, {});
    script("positions", { data: [] }, { data: { id: "pos1", title: "Data Lead" } });
    expect(await createAndAssignPosition("tm1", { title: "Data Lead" })).toEqual({
      ok: true,
      position: { id: "pos1", title: "Data Lead" },
    });
    const insert = calls.find((c) => c.table === "positions" && c.ops.includes("insert"));
    expect(insert?.payloads[0]).toEqual({ title: "Data Lead", slug: "data-lead", active: true, department_id: "d1", employment_type: "full_time" });
    const repoint = calls.filter((c) => c.table === "team_members" && c.ops.includes("update"));
    expect(repoint.map((c) => c.payloads[0])).toEqual([{ position_id: "pos1" }]);
  });
});
