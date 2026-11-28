import { beforeEach, describe, expect, it, vi } from "vitest";
import { builderFor, calls, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// AE.4. The invite at the lib seam, with the auth admin client, the link
// minting, the email and the grant helper faked: what a Super Admin pressing
// Send would notice in People, on the team, in the grants and in the inbox.
const auth = {
  users: [] as Record<string, unknown>[],
  updated: [] as unknown[],
  deleted: [] as string[],
  // Set to make the next deleteUser fail, as Supabase does while a row still references the login.
  deleteError: null as { message: string } | null,
  // People's link to the login at the moment deleteUser ran: it must already be gone.
  unlinkedBeforeDelete: [] as boolean[],
};
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: (table: string) => builderFor(table) },
  supabase: {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: auth.users }, error: null }),
        getUserById: async (id: string) => ({ data: { user: auth.users.find((u) => u.id === id) ?? null }, error: null }),
        updateUserById: async (id: string, patch: unknown) => {
          auth.updated.push({ id, patch });
          return { error: null };
        },
        deleteUser: async (id: string) => {
          auth.unlinkedBeforeDelete.push(calls.some((c) => c.table === "people" && c.ops[0] === "update" && (c.payloads[0] as { auth_user_id?: unknown })?.auth_user_id === null));
          if (auth.deleteError) return { error: auth.deleteError };
          auth.deleted.push(id);
          return { error: null };
        },
      },
    },
  },
}));
const audits: { context?: Record<string, unknown> }[] = [];
vi.mock("@/kernel/audit/audit", () => ({ recordAudit: async (a: (typeof audits)[number]) => void audits.push(a) }));
vi.mock("@/kernel/identity/writes", () => ({
  insertPeople: (row: unknown) => builderFor("people").insert(row),
  insertTeamMembers: (row: unknown) => builderFor("team_members").insert(row),
  updatePeople: (patch: unknown) => builderFor("people").update(patch),
}));
vi.mock("@/kernel/identity/permission-registry", () => ({
  permissionRegistry: () => ({
    atoms: { "surface.admin": {}, "finance.invoices": {}, "crm.pipeline": {} },
    routes: { "/admin/finance": "finance.invoices", "/admin/leads": "crm.pipeline" },
    actions: {},
    implies: {},
    roles: {
      accountant: { owner: "finance", name: "Accountant", sentence: "", locked: false, atoms: [{ permission: "surface.admin", scope: "all" }] },
      "super-admin": { owner: "kernel", name: "Super Admin", sentence: "", locked: true, atoms: [{ permission: "access.manage", scope: "all" }] },
    },
  }),
}));
const links: { type: string; email: string; redirectTo: string; verifyPath: string; data?: unknown }[] = [];
vi.mock("@/kernel/identity/session", () => ({
  mintVerifyLink: async (p: (typeof links)[number]) => {
    links.push(p);
    return { verifyUrl: `https://x.test${p.verifyPath}?token_hash=t&type=${p.type}`, userId: "u-new" };
  },
}));
const emails: { to: string; subject: string; html: string }[] = [];
// Whether the instance can send email, and the temporary passwords issued when
// it cannot (kernel/identity/temporary-password.ts).
const mail = { on: true };
const issued: { email: string; authUserId: string | null; userMetadata?: unknown }[] = [];
vi.mock("@/kernel/identity/temporary-password-issue", () => ({
  issueTemporaryPassword: async (i: (typeof issued)[number]) => {
    issued.push(i);
    return { ok: true, userId: i.authUserId ?? "u-temp", password: "Falcon-Harbor-3927" };
  },
}));
vi.mock("@/kernel/messaging/email", () => ({
  canSendEmail: () => mail.on,
  sendTransactionalEmail: async (e: (typeof emails)[number]) => {
    emails.push(e);
    return true;
  },
}));
const grants: { personId: string; roleId: string; reason: unknown }[] = [];
const revokes: { id: string; reason: string }[] = [];
const created: { name: string; atoms: string[] } = { name: "", atoms: [] };
vi.mock("./access-grant", () => ({
  grantRoleTo: async (g: { personId: string; roleId: string; reason: unknown }) => {
    grants.push(g);
    return { ok: true, message: "", roleName: g.roleId === "r-acc" ? "Accountant" : g.roleId, roleKey: "k", assignmentId: `g-${grants.length}` };
  },
  createRoleAs: async (_a: unknown, name: string) => {
    created.name = name;
    return { ok: true, message: "", id: "r-custom" };
  },
  addRolePermissionAs: async (_a: unknown, _r: string, atom: string) => {
    created.atoms.push(atom);
    return { ok: true, message: "", id: "rp" };
  },
  revokeGrantAs: async (_a: unknown, id: string, reason: string) => {
    revokes.push({ id, reason });
    return { ok: true, message: "", id };
  },
}));

import type { RequestAccess } from "@/kernel/identity/access-request";
import { sendInvite, type InviteInput } from "./access-invite";
import { cancelInvite, resendInvite } from "./access-invite-pending";

const access = { roles: [], user: { id: "auth-boss", email: "boss@example.com" }, personId: "p-boss" } as unknown as RequestAccess;
const input = (over: Partial<InviteInput> = {}): InviteInput => ({
  email: "ana@example.com",
  fullName: "Ana Lee",
  employmentType: "contract",
  roleKeys: ["accountant"],
  customAtoms: [],
  reason: "Runs the books from October",
  ...over,
});
/** The reads, in the order read() makes them: the person by email, the bundles' rows, the inviter, then the team row. */
function reads(person: Record<string, unknown> | null, team: Record<string, unknown> | null = null) {
  script("people", { data: person ? [person] : [] }, { data: [{ full_name: "Sam Rivera" }] });
  const pairs = (...permission: string[]) => permission.map((p) => ({ permission: p, revoked_at: null }));
  script("access_roles", {
    data: [
      { id: "r-acc", key: "accountant", name: "Accountant", kind: "granted", access_role_permissions: pairs("surface.admin", "finance.invoices") },
      { id: "r-sa", key: "super-admin", name: "Super Admin", kind: "granted", access_role_permissions: pairs("access.manage") },
      { id: "r-rev", key: "revenue", name: "Revenue", kind: "granted", access_role_permissions: pairs("crm.pipeline") },
      { id: "r-tm", key: "team-member", name: "Team member", kind: "implied", access_role_permissions: [] },
    ],
  });
  if (person) script("team_members", { data: team ? [team] : [] });
  if (person) script("access_role_assignments", { data: [] });
}
/** A temp or advisor's custom role name is checked against the existing keys. */
const nameFree = () => script("access_roles", { data: [] });
const writes = (table: string) => calls.filter((c) => c.table === table && ["insert", "update"].includes(c.ops[0]));

beforeEach(() => {
  resetFake();
  auth.unlinkedBeforeDelete = [];
  auth.deleteError = null;
  auth.users = [];
  auth.updated.length = 0;
  auth.deleted.length = 0;
  audits.length = 0;
  links.length = 0;
  emails.length = 0;
  grants.length = 0;
  revokes.length = 0;
  created.name = "";
  created.atoms = [];
  mail.on = true;
  issued.length = 0;
});

describe("sendInvite", () => {
  it("creates the person with source access_invite and a contractor team row, grants with the reason, and sends one invite email", async () => {
    reads(null);
    script("people", { data: { id: "p-ana" } }, { data: null });
    script("team_members", { data: null });
    expect(await sendInvite(access, input())).toEqual({ ok: true, message: "Invitation sent to Ana Lee." });
    expect(writes("people")[0].payloads[0]).toEqual({ email: "ana@example.com", full_name: "Ana Lee", source: "access_invite" });
    expect(writes("team_members")[0].payloads[0]).toEqual({ person_id: "p-ana", employment_type: "contract", status: "active" });
    expect(grants).toEqual([{ access, personId: "p-ana", roleId: "r-acc", reason: "Runs the books from October" }]);
    expect(links).toEqual([
      expect.objectContaining({
        type: "invite",
        redirectTo: "/admin/reset-password",
        verifyPath: "/admin/verify",
        data: { access_invite: { grant_ids: ["g-1"], inviter_person_id: "p-boss", landing: "admin" } },
      }),
    ]);
    expect(emails).toHaveLength(1);
    expect(audits[0]?.context).not.toHaveProperty("temporary_password");
    expect(emails[0].subject).toBe("Sam Rivera invited you to 8 Edges Company OS");
    expect(emails[0].html).toContain("Accountant");
    // The new login is linked to the person it was made for.
    expect(writes("people")[1].payloads[0]).toEqual({ auth_user_id: "u-new" });
  });

  it("reuses an existing person and their team row, and sends a sign-in link to an existing login", async () => {
    auth.users = [{ id: "u-ana", email: "ana@example.com", last_sign_in_at: "2026-10-01T00:00:00Z" }];
    reads({ id: "p-ana", full_name: "Ana Lee", email: "ana@example.com" }, { employment_type: "full_time" });
    expect(await sendInvite(access, input())).toMatchObject({ ok: true });
    expect(writes("people")).toEqual([]);
    expect(writes("team_members")).toEqual([]);
    expect(links).toEqual([expect.objectContaining({ type: "magiclink", verifyPath: "/admin/verify" })]);
    expect(emails).toHaveLength(1);
  });

  it("grants a role that exists only as a row, such as Revenue, and never offers an implied one", async () => {
    reads(null);
    script("people", { data: { id: "p-ana" } }, { data: null });
    script("team_members", { data: null });
    expect(await sendInvite(access, input({ roleKeys: ["revenue"] }))).toMatchObject({ ok: true });
    expect(grants.map((g) => g.roleId)).toEqual(["r-rev"]);
    resetFake();
    reads(null);
    expect(await sendInvite(access, input({ roleKeys: ["team-member"] }))).toEqual({ ok: false, error: "No role called team-member can be granted." });
  });

  it("refuses Super Admin for a contractor before any write", async () => {
    reads(null);
    const res = await sendInvite(access, input({ roleKeys: ["accountant", "super-admin"] }));
    expect(res).toEqual({ ok: false, error: "Super Admin goes only to a full-time, part-time or intern team member." });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
    expect(grants).toEqual([]);
    expect(emails).toEqual([]);
  });

  it("refuses a temp with nothing chosen before any write", async () => {
    reads(null);
    nameFree();
    expect(await sendInvite(access, input({ employmentType: "temp", roleKeys: [] }))).toMatchObject({ ok: false, error: expect.stringMatching(/temp or advisor/) });
    expect(calls.some((c) => c.ops[0] === "insert")).toBe(false);
  });

  it("creates a temp's custom shape as a one-person role, with Admin entry, and grants it", async () => {
    reads(null);
    nameFree();
    script("people", { data: { id: "p-ana" } }, { data: null });
    script("team_members", { data: null });
    expect(await sendInvite(access, input({ employmentType: "temp", roleKeys: [], customAtoms: ["crm.pipeline"] }))).toMatchObject({ ok: true });
    expect(created).toEqual({ name: "Ana Lee (Temp)", atoms: ["crm.pipeline", "surface.admin"] });
    expect(grants.map((g) => g.roleId)).toEqual(["r-custom"]);
  });
});

// A client instance with no email sender yet: the admin hands over a
// temporary password instead of the invite email nobody would receive.
describe("sendInvite without email", () => {
  beforeEach(() => {
    mail.on = false;
  });

  it("creates the login with a temporary password for the admin to hand over, and sends nothing", async () => {
    reads(null);
    script("people", { data: { id: "p-ana" } }, { data: null });
    script("team_members", { data: null });
    expect(await sendInvite(access, input())).toEqual({
      ok: true,
      message: "Ana Lee has a login. Give them the temporary password below.",
      temporaryPassword: "Falcon-Harbor-3927",
    });
    expect(issued).toEqual([
      { email: "ana@example.com", authUserId: null, userMetadata: { access_invite: { grant_ids: ["g-1"], inviter_person_id: "p-boss", landing: "admin" } } },
    ]);
    expect(links).toEqual([]);
    expect(emails).toEqual([]);
    // The new login is linked to the person it was made for, as an emailed invite's is.
    expect(writes("people")[1].payloads[0]).toEqual({ auth_user_id: "u-temp" });
    // The audit row says the invite went out as a credential in the admin's hands (CI.4).
    expect(audits).toEqual([expect.objectContaining({ context: expect.objectContaining({ action: "access_invite", temporary_password: true }) })]);
  });

  it("gives a pending invite a temporary password on the login it already has", async () => {
    auth.users = [
      { id: "u-ana", email: "ana@example.com", invited_at: "2026-10-08T00:00:00Z", last_sign_in_at: null, user_metadata: { access_invite: { grant_ids: ["g-0"] } } },
    ];
    reads({ id: "p-ana", full_name: "Ana Lee", email: "ana@example.com" }, { employment_type: "full_time" });
    expect(await sendInvite(access, input())).toMatchObject({ ok: true, temporaryPassword: "Falcon-Harbor-3927" });
    expect(issued).toEqual([
      expect.objectContaining({ email: "ana@example.com", authUserId: "u-ana", userMetadata: { access_invite: expect.objectContaining({ grant_ids: ["g-0", "g-1"] }) } }),
    ]);
    expect(writes("people")).toEqual([]);
    expect(emails).toEqual([]);
  });

  it("leaves a login that already signs in alone: new roles, no password change", async () => {
    auth.users = [{ id: "u-ana", email: "ana@example.com", last_sign_in_at: "2026-10-01T00:00:00Z" }];
    reads({ id: "p-ana", full_name: "Ana Lee", email: "ana@example.com" }, { employment_type: "full_time" });
    expect(await sendInvite(access, input())).toEqual({ ok: true, message: "Ana Lee has their roles. They sign in as usual." });
    expect(grants.map((g) => g.roleId)).toEqual(["r-acc"]);
    expect(issued).toEqual([]);
    expect(links).toEqual([]);
    expect(emails).toEqual([]);
  });
});

describe("resendInvite", () => {
  const pendingAna = () => {
    auth.users = [
      { id: "u-ana", email: "ana@example.com", invited_at: "2026-10-08T00:00:00Z", last_sign_in_at: null, user_metadata: { access_invite: { grant_ids: ["g-1"], landing: "team" } } },
    ];
    // loadInvitations: the people behind the pending logins, then their live grants.
    script("people", { data: [{ id: "p-ana", full_name: "Ana Lee", email: "ana@example.com" }] }, { data: [{ full_name: "Sam Rivera" }] });
    script("access_role_assignments", { data: [] });
  };

  it("emails a fresh invite link when the instance can send email", async () => {
    pendingAna();
    expect(await resendInvite(access, "u-ana")).toEqual({ ok: true, message: "Invitation sent to ana@example.com again." });
    expect(links).toEqual([expect.objectContaining({ type: "invite", redirectTo: "/team/change-password" })]);
    expect(emails).toHaveLength(1);
    expect(issued).toEqual([]);
  });

  it("issues a fresh temporary password instead when it cannot, and audits it", async () => {
    mail.on = false;
    pendingAna();
    expect(await resendInvite(access, "u-ana")).toEqual({
      ok: true,
      message: "New temporary password for ana@example.com. Give it to them below.",
      temporaryPassword: "Falcon-Harbor-3927",
    });
    expect(issued).toEqual([{ email: "ana@example.com", authUserId: "u-ana" }]);
    expect(links).toEqual([]);
    expect(emails).toEqual([]);
    expect(audits).toEqual([expect.objectContaining({ context: { action: "access_invite_temporary_password", auth_user_id: "u-ana" } })]);
  });
});

describe("cancelInvite", () => {
  it("revokes the invite's live grants with the reason, deletes the unused login, audits, and keeps the person and team rows", async () => {
    auth.users = [
      { id: "u-ana", email: "ana@example.com", invited_at: "2026-10-08T00:00:00Z", last_sign_in_at: null, user_metadata: { access_invite: { grant_ids: ["g-1", "g-2"], inviter_person_id: "p-boss", landing: "admin" } } },
    ];
    script("access_role_assignments", { data: [{ id: "g-1" }] });
    script("people", { data: [{ id: "p-ana" }] });
    expect(await cancelInvite(access, "u-ana", "Hired someone else")).toMatchObject({ ok: true });
    // People lets go of the login before it is deleted: the reference has no cascade.
    expect(auth.unlinkedBeforeDelete).toEqual([true]);
    expect(revokes).toEqual([{ id: "g-1", reason: "Hired someone else" }]);
    expect(auth.deleted).toEqual(["u-ana"]);
    expect(audits).toEqual([expect.objectContaining({ context: expect.objectContaining({ action: "access_invite_cancelled", reason: "Hired someone else" }) })]);
    // The person and team rows stay: the only write is People forgetting the deleted login.
    expect(calls.filter((c) => (c.table === "people" || c.table === "team_members") && c.ops[0] !== "select").map((c) => [c.table, c.ops[0], c.payloads[0]])).toEqual([
      ["people", "update", { auth_user_id: null }],
    ]);
  });

  it("puts People's link back when the login cannot be deleted", async () => {
    auth.users = [
      { id: "u-ana", email: "ana@example.com", invited_at: "2026-10-08T00:00:00Z", last_sign_in_at: null, user_metadata: { access_invite: { grant_ids: [] } } },
    ];
    auth.deleteError = { message: "still referenced" };
    script("people", { data: [{ id: "p-ana" }] }, { data: null });
    expect(await cancelInvite(access, "u-ana", "Hired someone else")).toMatchObject({ ok: false, error: expect.stringContaining("still referenced") });
    expect(calls.filter((c) => c.table === "people" && c.ops[0] === "update").map((c) => c.payloads[0])).toEqual([{ auth_user_id: null }, { auth_user_id: "u-ana" }]);
    auth.deleteError = null;
  });

  // #2062's relink ignored its own error: a failed relink left the person
  // unlinked from a login that still exists, and nobody was told.
  it("says so, and audits who was unlinked, when putting People's link back fails too", async () => {
    auth.users = [
      { id: "u-ana", email: "ana@example.com", invited_at: "2026-10-08T00:00:00Z", last_sign_in_at: null, user_metadata: { access_invite: { grant_ids: [] } } },
    ];
    auth.deleteError = { message: "still referenced" };
    script("people", { data: [{ id: "p-ana" }] }, { error: { message: "people unavailable" } });
    expect(await cancelInvite(access, "u-ana", "Hired someone else")).toMatchObject({ ok: false, error: expect.stringContaining("Putting People's link to the login back failed too") });
    expect(audits).toEqual([
      expect.objectContaining({ context: expect.objectContaining({ action: "access_invite_relink_failed", auth_user_id: "u-ana", people: ["p-ana"] }) }),
    ]);
    auth.deleteError = null;
  });

  it("refuses a login that has been used", async () => {
    auth.users = [{ id: "u-ana", email: "ana@example.com", invited_at: "x", last_sign_in_at: "y", user_metadata: { access_invite: { grant_ids: [] } } }];
    expect(await cancelInvite(access, "u-ana", "No")).toMatchObject({ ok: false });
    expect(auth.deleted).toEqual([]);
  });
});
