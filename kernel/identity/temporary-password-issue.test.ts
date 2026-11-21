import { beforeEach, describe, expect, it, vi } from "vitest";

// The issuer at the auth admin seam: what Supabase is asked to write, for a new
// login and for an existing one. The must-change flag goes to app_metadata, which
// only the server can write (CI.4); the invite marker stays in user_metadata,
// where the Invitations tab finds it.
const calls: { op: string; args: unknown[] }[] = [];
const existing = { id: "u-ana", user_metadata: { access_invite: { grant_ids: ["g-0"] }, full_name: "Ana" }, app_metadata: { provider: "email" } };
vi.mock("@/kernel/data/supabase", () => ({
  supabase: {
    auth: {
      admin: {
        getUserById: async (...args: unknown[]) => {
          calls.push({ op: "getUserById", args });
          return { data: { user: existing }, error: null };
        },
        generateLink: async (...args: unknown[]) => {
          calls.push({ op: "generateLink", args });
          return { data: { user: { id: "u-new", user_metadata: { access_invite: { grant_ids: ["g-1"] } } } }, error: null };
        },
        updateUserById: async (...args: unknown[]) => {
          calls.push({ op: "updateUserById", args });
          return { error: null };
        },
      },
    },
  },
}));

import { issueTemporaryPassword } from "./temporary-password-issue";

const flag = { must_change_password: true, temp_password_expires_at: expect.any(String) };

beforeEach(() => {
  calls.length = 0;
});

describe("issueTemporaryPassword", () => {
  it("creates a login the way an invite does, then sets the password, confirms the email and flags it in app_metadata", async () => {
    const res = await issueTemporaryPassword({ email: "ana@example.com", authUserId: null, userMetadata: { access_invite: { grant_ids: ["g-1"] } } });
    expect(res).toEqual({ ok: true, userId: "u-new", password: expect.stringMatching(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/) });
    expect(calls.map((c) => c.op)).toEqual(["generateLink", "updateUserById"]);
    expect(calls[0].args[0]).toEqual({ type: "invite", email: "ana@example.com", options: { data: { access_invite: { grant_ids: ["g-1"] } } } });
    const [id, patch] = calls[1].args as [string, Record<string, unknown>];
    expect(id).toBe("u-new");
    expect(patch).toEqual({
      password: res.ok ? res.password : "",
      email_confirm: true,
      app_metadata: flag,
      user_metadata: { access_invite: { grant_ids: ["g-1"] } },
    });
  });

  it("keeps an existing login's metadata, the invite marker included, and adds the flag beside it", async () => {
    const res = await issueTemporaryPassword({ email: "ana@example.com", authUserId: "u-ana" });
    expect(res).toMatchObject({ ok: true, userId: "u-ana" });
    expect(calls.map((c) => c.op)).toEqual(["getUserById", "updateUserById"]);
    const [, patch] = calls[1].args as [string, Record<string, unknown>];
    expect(patch.user_metadata).toEqual({ access_invite: { grant_ids: ["g-0"] }, full_name: "Ana" });
    expect(patch.app_metadata).toEqual(flag);
    expect(patch.user_metadata).not.toHaveProperty("must_change_password");
  });
});
