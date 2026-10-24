// Sign-in without email. An instance that cannot send email (no RESEND_API_KEY
// or EMAIL_FROM, which is every new client instance until it has a sender
// domain) still lets people in: an invite or a resend from Settings → Access
// sets a temporary password instead of emailing a link, the admin hands it
// over, and the person must choose their own password before reaching anything
// else (the fork's self-setup guide, .github/fork-overlay/README.md here,
// "Inviting people without email").
// It follows the portal's temporary password (entities/crm/lib/portal-invite.ts)
// and adds an expiry, so an unused one dies. Unlike the portal's flag, which sits
// in user_metadata where its holder can rewrite it from the browser, this one
// sits in app_metadata, which only the server's admin client can write (CI.4):
// the person cannot clear the must-change step or push the expiry themselves.
//
// Not meant to be strong at rest: it is read aloud or pasted into a chat, works
// until the person changes it or for TEMPORARY_PASSWORD_HOURS, whichever comes
// first, and Supabase rate-limits sign-in attempts. The expiry is the app's,
// not Supabase's: the password still authenticates after it, and passwordGate
// is what signs such a session out on /team and /admin. Cancel on the
// Invitations tab (deleting the login) is what revokes it outright. Until it is
// changed, whoever holds it can sign in as the person it was made for. Readability matters more
// than entropy because people type it by hand. The app never stores, emails or
// logs it; the admin sees it once.
//
// The proxy imports passwordGate from here, so this module stays free of the
// secret-key client; setting the password lives in temporary-password-issue.ts.

import { randomInt } from "node:crypto";
import { TEMPORARY_PASSWORD_HOURS } from "./temporary-password-hours";

const WORDS = [
  "Harbor", "Falcon", "Summit", "Cedar", "Maple", "Anchor", "Compass", "Meadow",
  "Orchid", "Granite", "Lantern", "Osprey", "Willow", "Beacon", "Canyon", "Marigold",
  "Juniper", "Cobalt", "Pebble", "Thistle", "Quartz", "Sable", "Verbena", "Wander",
  "Cypress", "Dune", "Ember", "Fjord", "Glacier", "Heron", "Indigo", "Kestrel",
  "Lark", "Mesa", "Nimbus", "Onyx", "Prairie", "Rowan", "Slate", "Tundra",
];

/** Two capitalised words and four digits, e.g. "Falcon-Harbor-3927". */
export function generateTemporaryPassword(): string {
  const word = () => WORDS[randomInt(WORDS.length)];
  return `${word()}-${word()}-${randomInt(1000, 10000)}`;
}

type TemporaryPasswordMetadata = { must_change_password: true; temp_password_expires_at: string };

/** The user_metadata a temporary password carries: change it first, and when it dies. */
export function temporaryPasswordMetadata(now: Date = new Date()): TemporaryPasswordMetadata {
  return {
    must_change_password: true,
    temp_password_expires_at: new Date(now.getTime() + TEMPORARY_PASSWORD_HOURS * 3_600_000).toISOString(),
  };
}

type GatedUser = { app_metadata?: Record<string, unknown> | null };
type PasswordGate = { redirect: string; signOut: boolean } | null;

const onSurface = (pathname: string, surface: string) => pathname === surface || pathname.startsWith(`${surface}/`);

/**
 * Where a signed-in request must go instead, for an account still on a
 * temporary password: its surface's password page, or the login page (signed
 * out) once the password has expired unused. Null lets the request through.
 * The password pages are sessionless paths, so the proxy never asks about them
 * and cannot loop. The portal keeps its own layout gate.
 */
export function passwordGate(user: GatedUser, pathname: string, now: Date = new Date()): PasswordGate {
  const meta = user.app_metadata ?? {};
  if (meta.must_change_password !== true) return null;
  const surface = onSurface(pathname, "/team") ? "team" : onSurface(pathname, "/admin") ? "admin" : null;
  if (!surface) return null;
  // A flag with no expiry is not expired, only unchanged.
  const expiresAt = typeof meta.temp_password_expires_at === "string" ? Date.parse(meta.temp_password_expires_at) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return { redirect: `/${surface}/login`, signOut: true };
  return { redirect: surface === "team" ? "/team/change-password" : "/admin/reset-password", signOut: false };
}
