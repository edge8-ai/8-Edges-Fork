import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The signed-in person setting their own password on the server: the session,
// the access read and the auth admin client are faked; what is asserted is the
// one write Supabase receives and where the form is told to land.
const state = {
  user: { id: "u-1", email: "ana@example.com" } as { id: string; email: string } | null,
  meta: { must_change_password: true, temp_password_expires_at: "2026-10-17T00:00:00Z", access_invite: { landing: "admin" } } as Record<string, unknown>,
  admin: false,
  // When the login last signed in: the change needs a recent one (CI.4).
  lastSignIn: "2026-10-15T09:00:00Z" as string | null,
  updates: [] as { id: string; patch: Record<string, unknown> }[],
  updateError: null as { message: string } | null,
};
vi.mock("./session-user", () => ({ getSessionUser: async () => state.user }));
vi.mock("./access-request", () => ({ getAccess: async () => ({ may: (atom: string) => atom === "surface.admin" && state.admin }) }));
vi.mock("@/kernel/data/supabase", () => ({
  supabase: {
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { id, user_metadata: state.meta, app_metadata: { provider: "email" }, last_sign_in_at: state.lastSignIn } },
          error: null,
        }),
        updateUserById: async (id: string, patch: Record<string, unknown>) => {
          state.updates.push({ id, patch });
          return { error: state.updateError };
        },
      },
    },
  },
}));

import { changeOwnPassword } from "./own-password";

const NOW = new Date("2026-10-15T10:00:00Z");

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.lastSignIn = "2026-10-15T09:00:00Z";
  state.user = { id: "u-1", email: "ana@example.com" };
  state.admin = false;
  state.updates = [];
  state.updateError = null;
});

describe("changeOwnPassword", () => {
  it("refuses a short password before touching anything", async () => {
    expect(await changeOwnPassword("short", "team")).toEqual({ ok: false, error: "Use at least 8 characters." });
    expect(state.updates).toEqual([]);
  });

  it("refuses without a session", async () => {
    state.user = null;
    expect(await changeOwnPassword("long-enough", "team")).toMatchObject({ ok: false });
    expect(state.updates).toEqual([]);
  });

  it("sets the password and clears the temporary password's flag and expiry, keeping other metadata", async () => {
    expect(await changeOwnPassword("long-enough", "team")).toEqual({ ok: true, landing: "/team" });
    expect(state.updates).toEqual([
      {
        id: "u-1",
        patch: {
          password: "long-enough",
          // The gate's flag lives in app_metadata; null removes the keys and leaves the provider alone.
          app_metadata: { must_change_password: null, temp_password_expires_at: null },
          // The portal's flag lives in user_metadata; it is cleared as the browser forms did.
          user_metadata: { must_change_password: false, temp_password_expires_at: null, access_invite: { landing: "admin" } },
        },
      },
    ]);
  });

  // The rule Supabase's secure password change applies to its own user API: a
  // password changes only within a day of signing in, so a long-lived stolen
  // session cannot lock the owner out. The admin client skips that setting, so
  // this helper enforces it itself.
  it("refuses a sign-in older than a day, and a login that never signed in", async () => {
    state.lastSignIn = "2026-10-14T09:59:59Z";
    // The refusal carries where to sign in again, since neither password page
    // has a sign-out of its own; the admin login comes back to its form.
    expect(await changeOwnPassword("long-enough", "team")).toEqual({
      ok: false,
      error: "For your security, sign in again, then set your password.",
      signInAgain: "/team/login",
    });
    expect(await changeOwnPassword("long-enough", "admin")).toEqual({
      ok: false,
      error: "For your security, sign in again, then set your password.",
      signInAgain: "/admin/login?redirect=%2Fadmin%2Freset-password",
    });
    state.lastSignIn = null;
    expect(await changeOwnPassword("long-enough", "team")).toMatchObject({ ok: false });
    expect(state.updates).toEqual([]);
    state.lastSignIn = "2026-10-14T10:00:01Z";
    expect(await changeOwnPassword("long-enough", "team")).toMatchObject({ ok: true });
  });

  it("lands an admin who used the admin form on /admin, and anyone else on /team", async () => {
    state.admin = true;
    expect(await changeOwnPassword("long-enough", "admin")).toEqual({ ok: true, landing: "/admin" });
    expect(await changeOwnPassword("long-enough", "team")).toEqual({ ok: true, landing: "/team" });
    // A team member a temporary password sent to the admin form: /admin would only refuse them.
    state.admin = false;
    expect(await changeOwnPassword("long-enough", "admin")).toEqual({ ok: true, landing: "/team" });
  });

  it("reports Supabase's refusal", async () => {
    state.updateError = { message: "Password should be different from the old password." };
    expect(await changeOwnPassword("long-enough", "team")).toEqual({ ok: false, error: "Password should be different from the old password." });
  });
});
