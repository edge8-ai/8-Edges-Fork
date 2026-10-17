import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The leave approver is named to the employee and in the emails to the
// client's watchers. A person with only a first_name stored is named by it,
// never by their address, as the chain before S.16 did (S.16.22).

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/entities/contacts", () => ({ selectStaffAssignments: () => builderFor("staff_assignments") }));

import { resolveLeaveApprover } from "./approver";

const manager = (people: Record<string, string | null>) => {
  script("staff_assignments", { data: [{ client_manager_person_id: "p-mgr", company_id: "co-1" }] });
  script("people", { data: { id: "p-mgr", email: "lan@client.test", ...people } });
};

beforeEach(() => resetFake());

describe("the leave approver's name", () => {
  it("is the display name when one is stored", async () => {
    manager({ display_name: "Lan Trần", first_name: "Lan", full_name: "Trần Thị Lan" });
    expect((await resolveLeaveApprover("tm-1"))?.displayName).toBe("Lan Trần");
  });

  it("is the first name for a person with nothing else, never the email", async () => {
    manager({ display_name: null, preferred_name: null, full_name: null, first_name: "Lan" });
    expect((await resolveLeaveApprover("tm-1"))?.displayName).toBe("Lan");
  });

  it("is \"Client manager\" for a client-side approver with no name, never the address (S.16.26)", async () => {
    // Their name reaches the client's watchers.
    manager({ display_name: null, preferred_name: null, full_name: null, first_name: null });
    expect((await resolveLeaveApprover("tm-1"))?.displayName).toBe("Client manager");
  });

  it("falls back to the email for an Edge8 approver with no name, who is named only to staff", async () => {
    script("staff_assignments", { data: [] });
    script("team_members", { data: { manager_id: "tm-boss" } }, { data: { person_id: "p-boss" } });
    script("people", { data: { id: "p-boss", email: "boss@edge8.test", display_name: null, preferred_name: null, full_name: null, first_name: null } });
    expect(await resolveLeaveApprover("tm-1")).toMatchObject({ kind: "edge8", displayName: "boss@edge8.test" });
  });
});

// S.19.5. Each step falls through to the next on "nobody", so a failed read
// used to be taken for "nobody" and hand the decision to the wrong person.
describe("the leave approver when a read fails", () => {
  it("raises on a failed placement read instead of naming the Edge8 manager", async () => {
    script("staff_assignments", { error: { message: "connection reset" } });
    script("team_members", { data: { manager_id: "tm-boss" } }, { data: { person_id: "p-boss" } });
    script("people", { data: { id: "p-boss", email: "boss@edge8.test", display_name: "Boss", preferred_name: null, full_name: null, first_name: null } });
    await expect(resolveLeaveApprover("tm-1")).rejects.toThrow(/client manager placement/);
  });

  it("raises on a failed manager read instead of answering nobody", async () => {
    script("staff_assignments", { data: [] });
    script("team_members", { error: { message: "connection reset" } });
    await expect(resolveLeaveApprover("tm-1")).rejects.toThrow(/member manager/);
  });
});
