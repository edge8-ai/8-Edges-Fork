import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The client admin's Users page shows each person's email in its own column,
// so the name never repeats it: a person with no name stored is "Unnamed"
// (S.16.26).

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/entities/contacts", () => ({ selectPersonCompanies: vi.fn(), insertPersonCompanies: vi.fn() }));
vi.mock("@/entities/crm", () => ({
  invitePortalMemberCore: vi.fn(),
  resendPortalLinkCore: vi.fn(),
  revokePortalMemberCore: vi.fn(),
  portalStatusesFor: async () => () => "active",
}));
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/kernel/identity/writes", () => ({ insertPeople: vi.fn(), updatePortalMembers: vi.fn() }));
vi.mock("@/entities/portal/lib/roles", () => ({ isPortalAdmin: () => true, ROLE_DENIED: "denied" }));

import type { PortalActor } from "@/kernel/identity/portal-auth";
import { listCompanyUsers } from "./users";

const actor = { personId: "p-admin" } as unknown as PortalActor;
const member = (people: Record<string, string | null>) => ({ person_id: people.id, role: "viewer", status: "active", people: { auth_user_id: null, ...people } });

beforeEach(() => resetFake());

describe("the client's Users page", () => {
  it("names each person without repeating their email", async () => {
    script("portal_members", {
      data: [
        member({ id: "p1", display_name: "Lan Trần", full_name: "Trần Thị Lan", preferred_name: null, email: "lan@client.test" }),
        member({ id: "p2", display_name: null, full_name: null, preferred_name: null, email: "anon@client.test" }),
      ],
    });
    const users = await listCompanyUsers(actor, "co-1");
    expect(users?.map((u) => [u.name, u.email])).toEqual([
      ["Lan Trần", "lan@client.test"],
      ["Unnamed", "anon@client.test"],
    ]);
  });
});
