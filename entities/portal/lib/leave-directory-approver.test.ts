import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The leave directory names each member's client-side approver to the client.
// A manager with no name stored must not reach the client as their address,
// nor as "Edge8", which would say nobody on the client's side approves
// (S.16.18).

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/entities/org", () => ({ selectTeamDirectory: () => builderFor("team_directory") }));
// The kernel fake has no `.not()`; this read needs one, and it filters nothing
// the test depends on.
vi.mock("@/entities/contacts", () => ({
  selectStaffAssignments: () => {
    const b = builderFor("staff_assignments") as unknown as Record<string, unknown>;
    b.not = () => b;
    return b;
  },
}));
// The staff-name helper stays real: it is what the member tests below exercise.
vi.mock("@/entities/portal/lib/team", async (importActual) => ({
  ...(await importActual<typeof import("@/entities/portal/lib/team")>()),
  getAssignedTeamMemberIds: vi.fn(async () => ["tm-1"]),
}));
vi.mock("@/entities/time-off", async (importActual) => ({
  ...(await importActual<typeof import("@/entities/time-off")>()),
  getMemberLeave: vi.fn(async () => new Map()),
  getBalanceReviews: vi.fn(async () => new Map()),
  teamMemberIdsManagedBy: vi.fn(async () => []),
}));

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { getAssignedLeaveDirectory } from "./time-off";

const actor = { personId: "p-client", companyScope: ["co-1"] } as unknown as PortalActor;

function scriptDirectory(manager: Record<string, string | null>, peopleError?: { message: string }) {
  script("team_directory", { data: [{ id: "tm-1", full_name: "Nguyễn Văn Hiếu", team: null, location: null, leave_policy: null, work_schedule: null, status: "active" }] });
  script("staff_assignments", { data: [{ team_member_id: "tm-1", client_manager_person_id: "p-mgr", created_at: "2026-01-01" }] });
  script("people", peopleError ? { error: peopleError } : { data: [{ id: "p-mgr", ...manager }] });
}

beforeEach(() => resetFake());

describe("the approver named in the client's leave directory", () => {
  it("is the manager's name", async () => {
    scriptDirectory({ display_name: "Lan Trần", preferred_name: null, full_name: "Trần Thị Lan", email: "lan@client.test" });
    const [row] = await getAssignedLeaveDirectory(actor);
    expect(row.approverName).toBe("Lan Trần");
  });

  it("is \"Client manager\" for a manager with no name, never their email", async () => {
    scriptDirectory({ display_name: null, preferred_name: null, full_name: null, email: "lan@client.test" });
    const [row] = await getAssignedLeaveDirectory(actor);
    expect(row.approverName).toBe("Client manager");
  });

  it("is \"Client manager\" when the people read fails, never \"Edge8\" (S.16.26)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    scriptDirectory({}, { message: "connection reset" });
    const [row] = await getAssignedLeaveDirectory(actor);
    expect(row.approverName).toBe("Client manager");
  });
});

// S.16.20. The client sees each Edge8 member by their display name, as every
// other screen shows them, not by full_name, which is the legal order and
// family name first for some people.
describe("the member named in the client's leave directory", () => {
  const member = (id: string, name: Record<string, string | null>) => ({
    id, display_name: null, preferred_name: null, full_name: null, team: null, location: null, leave_policy: null, work_schedule: null, status: "active", ...name,
  });
  const scriptMembers = (rows: ReturnType<typeof member>[]) => {
    script("team_directory", { data: rows });
    script("staff_assignments", { data: [] });
  };

  it("is their display name, not the family-name-first full_name", async () => {
    scriptMembers([member("tm-1", { display_name: "Hiếu Nguyễn", full_name: "Nguyễn Văn Hiếu" })]);
    const [row] = await getAssignedLeaveDirectory(actor);
    expect(row.name).toBe("Hiếu Nguyễn");
  });

  it("is ordered by first name, which full_name could not give", async () => {
    // Ordered on full_name, "Minh Pham" came before "Nguyễn Văn Hiếu".
    scriptMembers([
      member("tm-2", { full_name: "Minh Pham" }),
      member("tm-1", { display_name: "Hiếu Nguyễn", full_name: "Nguyễn Văn Hiếu" }),
    ]);
    const rows = await getAssignedLeaveDirectory(actor);
    expect(rows.map((r) => r.name)).toEqual(["Hiếu Nguyễn", "Minh Pham"]);
  });

  it("is \"Team member\" for a member with no name, never their email", async () => {
    scriptMembers([{ ...member("tm-1", {}), email: "someone@edge8.test" } as ReturnType<typeof member>]);
    const [row] = await getAssignedLeaveDirectory(actor);
    expect(row.name).toBe("Team member");
  });
});
