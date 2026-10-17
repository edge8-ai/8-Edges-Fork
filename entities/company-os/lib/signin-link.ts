// Server-only. Self-serve magic-link sign-in for the /admin Company OS, from the
// /admin/login page (no session). The admin mirror of lib/team/signin-link.ts:
// mint the token server-side and email a link to /admin/verify, which only
// redeems the token_hash on a button press, so corporate mail security
// (Microsoft Safe Links et al) can't prefetch and consume it first.
//
// Anti-abuse, mirroring team/portal: emails only go to auth users on the admin
// people who hold surface.admin (holdsSurfaceAdmin, the atom requireAdmin asks for), the
// caller-facing result is always neutral (no account enumeration), and repeat
// requests for the same email are throttled. The throttle map is per serverless
// instance, best-effort; the allowlist gate is the real limiter.

import { PALETTE } from "@/kernel/config/palette";
import { supabase } from "@/kernel/data/supabase";
import { holdsSurfaceAdmin } from "@/kernel/identity/access-of-person";
import { findAuthUserByEmail, bannedUntil } from "@/kernel/identity/auth-users";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { mintVerifyLink } from "@/kernel/identity/session";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";

const SELF_SERVE_COOLDOWN_MS = 60_000;
const lastSelfServeSend = new Map<string, number>();

function throttled(key: string): boolean {
  const now = Date.now();
  const last = lastSelfServeSend.get(key) ?? 0;
  if (now - last < SELF_SERVE_COOLDOWN_MS) return true;
  lastSelfServeSend.set(key, now);
  return false;
}

// The auth user for `email`, but only when they hold surface.admin and are
// not banned; null (silently) otherwise.
async function activeAdminAuthUser(email: string): Promise<{ id: string } | null> {
  // A failed read sends nothing: no is the safe side, and the page stays neutral.
  if (!(await holdsSurfaceAdmin(email).catch(() => false))) return null;
  const user = await findAuthUserByEmail(email);
  if (!user) return null;
  const { data: fullUser, error: userErr } = await supabase.auth.admin.getUserById(user.id);
  if (userErr) console.error("[company-os/signin-link] auth.getUserById", userErr);
  if (!fullUser?.user || bannedUntil(fullUser.user)) return null;
  return { id: user.id };
}

// Self-serve "Email me a sign-in link". Always resolves; the login page shows the
// same neutral notice whether or not an email went out.
export async function sendAdminSelfServeSignInLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || throttled(email)) return;
  if (!(await activeAdminAuthUser(email))) return;

  const link = await mintVerifyLink({
    type: "magiclink",
    email,
    redirectTo: "/api/auth/callback?next=/admin",
    verifyPath: "/admin/verify",
  });
  if ("error" in link) return;
  const { verifyUrl } = link;

  // The log gets the same email with the button left out (B.15).
  const siteOrigin = await getSiteOrigin();
  const body = (button: string) => `
    <p>Here is your sign-in link for the 8 Edges Company OS:</p>
    ${button}
    <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a sign-in page. Press "Sign in" there and you're in. If the link expires, you can request a fresh one any time at <a href="${siteOrigin}/admin/login">${siteOrigin}/admin/login</a>.</p>
    `;
  await sendTransactionalEmail({
    to: email,
    subject: "Your 8 Edges Company OS sign-in link",
    html: body(
      `<p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Sign in to the Company OS</a></p>`,
    ),
    logBody: body(SIGN_IN_LINK_WITHHELD),
    logMeta: { source: "admin_self_serve_link" },
  });
}

// Self-serve "Forgot password" for the Company OS. Admin sign-in is magic-link
// first, but admins can also set a password; this sends a recovery link through
// the same scanner-proof /admin/verify interstitial, and verifying lands the
// person on /admin/reset-password to choose a new one. It replaces the former
// browser-side resetPasswordForEmail() call on the login form, which emailed
// Supabase's raw one-time link and had the Safe Links prefetch bug the team and
// portal flows were fixed for. Always resolves; the login page shows the same
// neutral notice whether or not an email went out.
export async function sendAdminSelfServePasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || throttled(`reset:${email}`)) return;
  if (!(await activeAdminAuthUser(email))) return;

  const link = await mintVerifyLink({
    type: "recovery",
    email,
    redirectTo: "/admin/reset-password",
    verifyPath: "/admin/verify",
  });
  if ("error" in link) return;
  const { verifyUrl } = link;

  // The log gets the same email with the button left out (B.15).
  const siteOrigin = await getSiteOrigin();
  const body = (button: string) => `
    <p>We received a request to reset the password on your 8 Edges Company OS account.</p>
    ${button}
    <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a page where you can set a new password. If you did not request this, you can safely ignore this email, and you can always sign in without a password at <a href="${siteOrigin}/admin/login">${siteOrigin}/admin/login</a>.</p>
    `;
  await sendTransactionalEmail({
    to: email,
    subject: "Reset your 8 Edges Company OS password",
    html: body(
      `<p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Choose a new password</a></p>`,
    ),
    logBody: body(SIGN_IN_LINK_WITHHELD),
    logMeta: { source: "admin_self_serve_reset" },
  });
}
