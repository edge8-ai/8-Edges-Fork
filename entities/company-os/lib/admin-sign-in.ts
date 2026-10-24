// The sign-in email a new admin gets (AC.20). It used to go out from Settings →
// Admins when a row was added; since the Admin grant in Settings → Access is the
// only register, granting Admin sends it, and it is the one job of the retired
// screen that Access had to take over.
//
// Only a person with no login yet is sent anything: Supabase's invite creates
// the auth user and its link lets them set a password. Someone who already has
// a login signs in as before (and "Forgot password" on the login page covers a
// lost one). The invite is generated server-side, so its link comes back via
// the implicit flow with the session in the URL hash (#access_token=…), which
// is why it lands straight on /admin/reset-password (which reads the hash) and
// not on /api/auth/callback, which only handles the PKCE ?code= flow of the
// browser-initiated "forgot password" form.
import { supabase } from "@/kernel/data/supabase";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { findAuthUserByEmail } from "@/kernel/identity/auth-users";

/** What happened to the email: sent, not needed (null message), or failed. */
export type AccessEmail = { ok: true; message: string | null } | { ok: false; error: string };

/** Invite this address to set a password, unless it already has a login. */
export async function sendAccessEmail(email: string): Promise<AccessEmail> {
  const normalized = email.trim().toLowerCase();
  if (await findAuthUserByEmail(normalized)) return { ok: true, message: null };
  const redirectTo = `${await getSiteOrigin()}/admin/reset-password`;
  const { error } = await supabase.auth.admin.inviteUserByEmail(normalized, { redirectTo });
  if (error) return { ok: false, error: `Invite failed: ${error.message}` };
  return { ok: true, message: `Invite sent to ${normalized}.` };
}
