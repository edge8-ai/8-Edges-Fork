import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// S.16.17 gave the /team and /portal actors a `greeting` beside `displayName`.
// Every page is built on these actors, so the change is additive: each test
// below states the WHOLE actor, and a field that moved, renamed or changed
// value fails it. The greeting is greetingName over the same person row, so a
// person with no display_name is greeted exactly as greetingName greets them.

let user: { id: string; email: string; user_metadata?: Record<string, unknown> } | null = null;
let admin = false;
let assumeCookie: string | undefined;
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => (assumeCookie ? { value: assumeCookie } : undefined) }) }));
vi.mock("@/kernel/data/supabase/server", () => ({
  createSessionClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (table: string) => builderFor(table) } }));
vi.mock("@/kernel/identity/admin-register", () => ({ holdsAdminGrant: vi.fn(async () => admin) }));
vi.mock("@/kernel/identity/access-of-person", () => ({ holdsSurfaceAdmin: vi.fn(async () => admin) }));

import { getTeamActor } from "./team-auth";
import { getPortalActor } from "./portal-auth";

// Family-name-first, no display_name, a full name filed as preferred_name: the
// case where the name and the greeting differ most.
const HIEU = { display_name: null, preferred_name: "Nguyễn Văn Hiếu", first_name: "Hiếu", full_name: "Nguyễn Văn Hiếu" };

beforeEach(() => {
  resetFake();
  user = { id: "auth-1", email: "Hieu@Edge8.test" };
  admin = false;
  assumeCookie = undefined;
});

describe("the team actor", () => {
  it("keeps every field it had and adds the greeting", async () => {
    script("people", { data: { id: "p-1", ...HIEU, email: "hieu@edge8.test", avatar_url: "a.png" } });
    script(
      "team_members",
      { data: [{ id: "tm-1", status: "active", employment_type: "contract" }] },
      { data: [{ id: "tm-2", person_id: "p-2" }] },
    );
    expect(await getTeamActor()).toEqual({
      actor: {
        authUserId: "auth-1",
        personId: "p-1",
        teamMemberId: "tm-1",
        role: "manager",
        displayName: "Nguyễn Văn Hiếu",
        greeting: "Hiếu",
        name: "Nguyễn Văn Hiếu",
        avatarUrl: "a.png",
        email: "hieu@edge8.test",
        teamMemberScope: ["tm-1", "tm-2"],
        personScope: ["p-1", "p-2"],
        directReportIds: ["tm-2"],
        isAdmin: false,
        // The fact the access resolver's baseline role follows (ADR 0013).
        employmentType: "contract",
      },
    });
  });

  it("has no greeting when greetingName has none, and a page says its own word", async () => {
    script("people", { data: { id: "p-1", display_name: null, preferred_name: null, first_name: null, full_name: "Nguyễn Văn Hiếu", email: "h@x.test", avatar_url: null } });
    script("team_members", { data: [{ id: "tm-1", status: "active" }] }, { data: [] });
    const { actor } = await getTeamActor();
    expect(actor?.displayName).toBe("Nguyễn Văn Hiếu");
    expect(actor?.greeting).toBeNull();
  });
});

describe("the portal actor", () => {
  it("keeps every field it had and adds the greeting", async () => {
    script("people", { data: { id: "p-9", ...HIEU, email: "client@co.test" } });
    script("team_members", { data: [] });
    script("portal_members", { data: [{ id: "pm-1", company_id: "co-1", role: "admin", companies: { name: "Co" } }] });
    user = { id: "auth-9", email: "client@co.test", user_metadata: { must_change_password: true } };
    expect(await getPortalActor()).toEqual({
      actor: {
        authUserId: "auth-9",
        personId: "p-9",
        displayName: "Nguyễn Văn Hiếu",
        greeting: "Hiếu",
        email: "client@co.test",
        companyScope: ["co-1"],
        memberships: [{ id: "pm-1", companyId: "co-1", companyName: "Co", role: "admin" }],
        impersonation: null,
        mustChangePassword: true,
      },
    });
  });

  it("greets an assumed person as that person is greeted, so the admin sees what the client sees", async () => {
    admin = true;
    assumeCookie = "s-1";
    user = { id: "auth-admin", email: "ops@edge8.test" };
    // The admin's own person read is started but never awaited on this path, so
    // the one row the fake answers with is the assumed person's.
    script("people", { data: { id: "p-9", display_name: "Lan Trần", preferred_name: null, first_name: null, full_name: "Trần Thị Lan", email: "lan@co.test" } });
    script("portal_assume_sessions", {
      data: { id: "s-1", company_id: "co-1", person_id: "p-9", started_by: "ops@edge8.test", expires_at: "2999-01-01T00:00:00Z", ended_at: null },
    });
    script("companies", { data: { id: "co-1", name: "Co" } });
    script("portal_members", { data: { role: "contributor" } });
    expect(await getPortalActor()).toEqual({
      actor: {
        authUserId: "auth-admin",
        personId: "p-9",
        displayName: "Trần Thị Lan",
        greeting: "Lan",
        email: "lan@co.test",
        companyScope: ["co-1"],
        memberships: [{ id: "s-1", companyId: "co-1", companyName: "Co", role: "contributor" }],
        impersonation: { adminEmail: "ops@edge8.test", sessionId: "s-1", expiresAt: "2999-01-01T00:00:00Z" },
        mustChangePassword: false,
      },
    });
  });
});
