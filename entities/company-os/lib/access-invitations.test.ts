import { describe, expect, it } from "vitest";
import { linkLifetimeHours, pendingInvitations, type InvitedUser } from "./access-invitations";

// AE.4. The Invitations tab: invited from the drawer and never signed in,
// joined to People and to the grants the invite made, Expired once older than
// the configured link lifetime.
const now = new Date("2026-10-08T12:00:00Z");
const marker = (grant_ids: string[]) => ({ access_invite: { grant_ids, inviter_person_id: "p-sam", landing: "admin" } });
const user = (over: Partial<InvitedUser>): InvitedUser => ({
  id: "u-1",
  email: "Ana@Example.com",
  invited_at: "2026-10-08T06:00:00Z",
  last_sign_in_at: null,
  user_metadata: marker(["g-1"]),
  ...over,
});
const people = [{ id: "p-ana", email: "ana@example.com", name: "Ana Lee" }];
const grants = [
  { id: "g-1", personId: "p-ana", roleName: "Accountant", grantedByName: "Sam" },
  { id: "g-0", personId: "p-ana", roleName: "Revenue", grantedByName: "Lee" },
];

describe("pendingInvitations", () => {
  it("lists an invite with the person, every role they hold, the inviter from the invite's grant and Sent", () => {
    expect(pendingInvitations({ users: [user({})], people, grants, now, lifetimeHours: 24 })).toEqual([
      {
        authUserId: "u-1",
        email: "ana@example.com",
        personId: "p-ana",
        name: "Ana Lee",
        roles: ["Accountant", "Revenue"],
        inviter: "Sam",
        sentAt: "2026-10-08T06:00:00Z",
        status: "Sent",
        grantIds: ["g-1"],
      },
    ]);
  });

  it("calls an invite older than the lifetime Expired", () => {
    const [row] = pendingInvitations({ users: [user({})], people, grants, now, lifetimeHours: 4 });
    expect(row.status).toBe("Expired");
  });

  it("drops anyone who has signed in, was never invited, or was invited from somewhere else", () => {
    const users = [
      user({ id: "signed", last_sign_in_at: "2026-10-08T07:00:00Z" }),
      user({ id: "never", invited_at: null }),
      user({ id: "portal", user_metadata: {} }),
    ];
    expect(pendingInvitations({ users, people, grants, now, lifetimeHours: 24 })).toEqual([]);
  });

  it("shows an invite whose email no longer matches People by its address, with no roles", () => {
    const [row] = pendingInvitations({ users: [user({ email: "gone@example.com" })], people, grants, now, lifetimeHours: 24 });
    expect(row).toMatchObject({ personId: null, name: "gone@example.com", roles: [], inviter: null, grantIds: [] });
  });
});

describe("linkLifetimeHours", () => {
  it("reads the configured hours and falls back to Supabase's 24-hour cap", () => {
    expect(linkLifetimeHours("6")).toBe(6);
    expect(linkLifetimeHours(undefined)).toBe(24);
    expect(linkLifetimeHours("48")).toBe(24);
    expect(linkLifetimeHours("soon")).toBe(24);
  });
});
