// Server-only. Self-serve sign-in link for the /team workspace, triggered from
// the /team/login page (no session). The team mirror of sendSelfServeSignInLink
// in lib/admin/portal-invite.ts, and it exists for the same reason: the
// browser-side signInWithOtp() path emails Supabase's raw one-time verify URL,
// and corporate mail security (Microsoft Safe Links et al) prefetches that link
// and consumes the token before the person can click it. This locked a client
// out of /portal (fixed in PR #642); staff are on Google Workspace so it hasn't
// bitten /team yet, but it was the same latent bug. We mint the token
// server-side and email a link to /team/verify, which only redeems the
// token_hash on a button press, something scanners don't do.
//
// Anti-abuse, mirroring the portal: emails only go to auth users with a linked,
// portal-eligible team_members record (the same allowlist requireTeamMember()
// enforces), the caller-facing result is always neutral (no account
// enumeration), and repeat requests for the same email are throttled. The
// throttle map is per serverless instance, best-effort; the membership gate is
// the real limiter.

import { PALETTE } from "@/kernel/config/palette";
import { supabase, companyOs } from "@/kernel/data/supabase";
import { PORTAL_STATUSES } from "@/kernel/identity/team-auth";
import { findAuthUserByEmail, bannedUntil } from "@/kernel/identity/auth-users";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { mintVerifyLink } from "@/kernel/identity/session";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { SIGN_IN_LINK_WITHHELD } from "@/kernel/messaging/sign-in-links";

const SELF_SERVE_COOLDOWN_MS = 60_000;
const lastSelfServeSend = new Map<string, number>();

function throttled(email: string): boolean {
  const now = Date.now();
  const last = lastSelfServeSend.get(email) ?? 0;
  if (now - last < SELF_SERVE_COOLDOWN_MS) return true;
  lastSelfServeSend.set(email, now);
  return false;
}

// The auth user for `email`, but only when they are linked to a person with a
// portal-eligible team_members record and are not banned; null (silently)
// otherwise. Identity gates on people.auth_user_id, matching lib/team-auth.ts.
async function activeTeamAuthUser(email: string): Promise<{ id: string } | null> {
  const user = await findAuthUserByEmail(email);
  if (!user) return null;
  const { data: fullUser, error: authError } = await supabase.auth.admin.getUserById(user.id);
  if (authError) console.error("[team/signin-link] auth.getUserById", authError);
  if (!fullUser?.user || bannedUntil(fullUser.user)) return null;

  const { data: people, error: peopleError } = await companyOs
    .from("people")
    .select("id")
    .eq("auth_user_id", user.id)
    .is("archived_at", null);
  if (peopleError) console.error("[team/signin-link] people", peopleError);
  const personIds = (people ?? []).map((p) => p.id as string);
  if (personIds.length === 0) return null;

  const { data: memberships, error: memberError } = await companyOs
    .from("team_members")
    .select("id")
    .in("person_id", personIds)
    .in("status", PORTAL_STATUSES)
    .limit(1);
  if (memberError) console.error("[team/signin-link] team_members", memberError);
  if ((memberships ?? []).length === 0) return null;

  return { id: user.id };
}

// Self-serve "Send sign-in link". Always resolves; the login page shows the
// same neutral notice whether or not an email went out.
export async function sendTeamSelfServeSignInLink(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || throttled(email)) return;
  if (!(await activeTeamAuthUser(email))) return;

  const link = await mintVerifyLink({
    type: "magiclink",
    email,
    redirectTo: "/team/callback",
    verifyPath: "/team/verify",
  });
  if ("error" in link) return;
  const { verifyUrl } = link;

  // The log gets the same email with the button left out (B.15).
  const siteOrigin = await getSiteOrigin();
  const body = (button: string) => `
    <p>Here is your sign-in link for the Edge8 Team workspace:</p>
    ${button}
    <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a sign-in page. Press "Sign in" there and you're in. If the link expires, you can request a fresh one any time at <a href="${siteOrigin}/team/login">${siteOrigin}/team/login</a>.</p>
    `;
  await sendTransactionalEmail({
    to: email,
    subject: "Your Edge8 Team sign-in link",
    html: body(
      `<p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Sign in to the Edge8 Team workspace</a></p>`,
    ),
    logBody: body(SIGN_IN_LINK_WITHHELD),
    logMeta: { source: "team_self_serve_link" },
  });
}

// Self-serve "Forgot password". Team sign-in is magic-link first, but staff can
// also set a password and sign in with it; this sends a recovery link through
// the same scanner-proof /team/verify interstitial, and verifying lands the
// person on /team/change-password to choose a new one. Always resolves; the
// login page shows the same neutral notice whether or not an email went out.
export async function sendTeamSelfServePasswordReset(rawEmail: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || throttled(`reset:${email}`)) return;
  if (!(await activeTeamAuthUser(email))) return;

  const link = await mintVerifyLink({
    type: "recovery",
    email,
    redirectTo: "/team/change-password",
    verifyPath: "/team/verify",
  });
  if ("error" in link) return;
  const { verifyUrl } = link;

  // The log gets the same email with the button left out (B.15).
  const siteOrigin = await getSiteOrigin();
  const body = (button: string) => `
    <p>We received a request to reset the password on your Edge8 Team workspace account.</p>
    ${button}
    <p style="font-size:13px;color:${PALETTE.greyMid};">The button takes you to a page where you can set a new password. If you did not request this, you can safely ignore this email, and you can always sign in without a password at <a href="${siteOrigin}/team/login">${siteOrigin}/team/login</a>.</p>
    `;
  await sendTransactionalEmail({
    to: email,
    subject: "Reset your Edge8 Team password",
    html: body(
      `<p style="margin:20px 0;"><a href="${verifyUrl}" style="display:inline-block;background:${PALETTE.dark};color:${PALETTE.white};text-decoration:none;font-weight:600;padding:12px 28px;border-radius:10px;">Choose a new password</a></p>`,
    ),
    logBody: body(SIGN_IN_LINK_WITHHELD),
    logMeta: { source: "team_self_serve_reset" },
  });
}
