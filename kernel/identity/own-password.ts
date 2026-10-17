// Server-only. The signed-in person sets their own password, on the server, and
// is told where to land. /team/change-password and /admin/reset-password use it
// instead of the browser's supabase.auth.updateUser, which in a client instance's live
// test of the temporary password (14 Oct 2026) saved the password and then never
// returned, leaving the form on its busy label for good. It clears the temporary
// password's flag and expiry in the same write (kernel/identity/temporary-password.ts),
// so the proxy's gate can never outlive the change.
//
// The admin client is not bound by the Supabase project's own rules for a
// password change made through the user API ("secure password change", which
// asks for a sign-in within the last day, and its minimum length), so this
// helper enforces both itself (CI.4): a sign-in within RECENT_SIGN_IN_HOURS and
// MIN_PASSWORD_LENGTH = 8, which is above Supabase's default of 6. Whether a
// project turns that setting on in its dashboard therefore does not matter. A
// temporary password or a recovery link has always just signed the person in.

import { supabase } from "@/kernel/data/supabase";
import { getAccess } from "./access-request";
import { getSessionUser } from "./session-user";

const MIN_PASSWORD_LENGTH = 8;
const RECENT_SIGN_IN_HOURS = 24;

export type OwnPasswordResult =
  | { ok: true; landing: "/admin" | "/team" }
  // signInAgain: where to sign in afresh when the sign-in is too old; neither
  // password page has a sign-out of its own, so the form links there.
  | { ok: false; error: string; signInAgain?: string };

const SIGN_IN_AGAIN = { team: "/team/login", admin: `/admin/login?redirect=${encodeURIComponent("/admin/reset-password")}` } as const;

/**
 * Change the signed-in person's password. `from` is the surface whose form was
 * used: someone who may open /admin and used its form lands there, everyone
 * else on /team (a temporary password can send a team member to the admin
 * form, where /admin would only refuse them).
 */
export async function changeOwnPassword(password: string, from: "admin" | "team"): Promise<OwnPasswordResult> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Your sign-in has expired. Sign in again, then set your password." };

  // Merge rather than replace: the login carries an invite marker and other
  // flags that other screens read.
  const { data, error: readError } = await supabase.auth.admin.getUserById(user.id);
  if (readError || !data.user) return { ok: false, error: "Your account could not be read. Try again." };
  const signedInAt = data.user.last_sign_in_at ? Date.parse(data.user.last_sign_in_at) : NaN;
  if (!Number.isFinite(signedInAt) || Date.now() - signedInAt > RECENT_SIGN_IN_HOURS * 3_600_000) {
    return { ok: false, error: "For your security, sign in again, then set your password.", signInAgain: SIGN_IN_AGAIN[from] };
  }
  // app_metadata holds the temporary password's flag (null removes a key and
  // leaves the provider alone); user_metadata holds the portal's, cleared as the
  // browser forms always did, merged so the invite marker survives.
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { must_change_password: null, temp_password_expires_at: null },
    user_metadata: { ...(data.user.user_metadata ?? {}), must_change_password: false, temp_password_expires_at: null },
  });
  if (error) return { ok: false, error: error.message };

  const access = await getAccess();
  return { ok: true, landing: from === "admin" && access?.may("surface.admin") ? "/admin" : "/team" };
}
