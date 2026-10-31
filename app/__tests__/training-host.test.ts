import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// QS.5b against this deployment's real declarations and Training's real
// implier: whoever organises a taught session holds the implied Host role,
// which Settings, Access names with its fact, and its training.host opens the
// organiser's session page, so mayOpen, the check notifications and search ask
// before they show a link, keeps their own session's link and closes Training's lists. The
// rows each role holds are the declared defaults (what the QS.5b access rows
// insert); the implier's read runs over the house fake.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());

import { PERMISSIONS } from "@/app/permissions";
import { accessContributions as trainingAccess } from "@/entities/training";
import { buildAccess, type AccessFacts } from "@/kernel/identity/access";
import { registerAccessContributions } from "@/kernel/identity/access-contributions";
import { mayOpen } from "@/kernel/identity/may-open";
import { registerPermissionRegistry } from "@/kernel/identity/permission-registry";

const rows = [
  ...Object.entries(PERMISSIONS.atoms).flatMap(([permission, atom]) => atom.holders.map((h) => ({ role: h.role, permission, scope: h.scope }))),
  ...Object.entries(PERMISSIONS.roles).flatMap(([role, r]) => r.atoms.map((a) => ({ role, permission: a.permission, scope: a.scope }))),
];
const fromRows = async (roles: readonly string[]) => rows.filter((r) => roles.includes(r.role));

const member = (personId: string): AccessFacts => ({
  personId,
  teamMemberId: `tm-${personId}`,
  isAdmin: false,
  isSuperAdmin: false,
  employmentType: "full_time",
  directReportPersonIds: [],
  isApprover: false,
  isPortalMember: false,
  portalCompanyIds: [],
  assignedRoles: [],
});

const TYPES = { data: [{ id: "ty-sharing", name: "Sharing session", sort_order: 40, archived_at: null }] };
const SESSION = "/team/training/sessions/6f1c6a9e-2b8f-4a3e-9d6e-1a2b3c4d5e6f";

beforeEach(() => {
  resetFake();
  registerPermissionRegistry(PERMISSIONS);
  registerAccessContributions([trainingAccess]);
});

describe("the Host role", () => {
  it("is declared as implied, and its atom is held by every organiser too", () => {
    expect(PERMISSIONS.atoms["training.host"]?.holders).toEqual(
      expect.arrayContaining([{ role: "host", scope: "own" }, { role: "manager", scope: "team" }, { role: "admin", scope: "all" }]),
    );
    expect(PERMISSIONS.roles["training-organiser"]?.atoms).toEqual(expect.arrayContaining([{ permission: "training.host", scope: "all" }]));
    expect(PERMISSIONS.routes["/team/training/sessions/[id]"]).toBe("training.host");
    expect(PERMISSIONS.routes["/team/training"]).toBe("training.organise");
  });

  it("is held, with its fact, by someone who organises a taught session, and opens their session's link and no list", async () => {
    script("training_types", TYPES);
    script("trainings", { data: [{ id: "t1" }] });
    const access = await buildAccess(member("p-host"), fromRows);
    expect(access.roles).toContainEqual({ role: "host", because: "hosts a taught session" });
    expect(access.may("training.host")).toBe(true);
    expect(access.may("training.organise")).toBe(false);
    expect(mayOpen(access, SESSION)).toBe(true);
    expect(mayOpen(access, "/team/training")).toBe(false);
    expect(mayOpen(access, "/team/training/plans/p1")).toBe(false);
  });

  it("is not held by a member who hosts nothing, whose link to a session page is dropped", async () => {
    script("training_types", TYPES);
    script("trainings", { data: [] });
    const access = await buildAccess(member("p-member"), fromRows);
    expect(access.roles.map((r) => r.role)).not.toContain("host");
    expect(mayOpen(access, SESSION)).toBe(false);
  });

  it("leaves a Training organiser's links as they were", async () => {
    script("training_types", TYPES);
    script("trainings", { data: [] });
    const access = await buildAccess({ ...member("p-lead"), assignedRoles: [{ role: "training-organiser", because: "was granted it" }] }, fromRows);
    expect(mayOpen(access, SESSION)).toBe(true);
    expect(mayOpen(access, "/team/training")).toBe(true);
  });
});
