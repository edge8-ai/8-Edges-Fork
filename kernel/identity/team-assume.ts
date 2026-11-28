// Team assume: a Super Admin sees the Team pages exactly as one team member
// sees them (Dave, 2026-10-10; docs/plans/2026-10-10-contractor-portal.md,
// PR 2). The Team counterpart of the client portal's Assume, on the same
// table (portal_assume_sessions, surface 'team') and the same rules: the
// admin's own sign-in is never touched, the cookie holds only an opaque
// session id, a session is honoured only for the admin who started it, and it
// lapses after ASSUME_SESSION_MINUTES.
//
// Two things make it safe to look through someone else's eyes:
// - The cookie is scoped to /team, so the Admin view and every /api route keep
//   the admin's own identity: assuming never locks the admin out of /admin.
// - The view is read-only. Every server action and form post under /team is
//   refused while assuming (refuseWritesWhileAssuming), so an admin can look
//   at a contractor's page but never save, submit or report as them. The
//   refusal is made by every guard a /team write can pass through:
//   requirePermission, requireTeamMember and the Workboard's boardActorFor. A
//   new guard that resolves the actor itself must call it as well.
import { cookies, headers } from "next/headers";
import { companyOs } from "@/kernel/data/supabase";
import { holdsSuperAdminGrant } from "@/kernel/identity/admin-register";

export const TEAM_ASSUME_COOKIE = "team_assume";
export const TEAM_ASSUME_PATH = "/team";

export type TeamImpersonation = { adminEmail: string; sessionId: string; expiresAt: string };

type SessionRow = { id: string; person_id: string; started_by: string; expires_at: string; ended_at: string | null; surface: string };

/**
 * The team session the signed-in admin's cookie names, if it is still open,
 * theirs, and they still hold Super Admin; null otherwise. Never throws: a
 * failed read means no session, so the admin simply sees their own view.
 */
export async function readTeamAssumeSession(adminEmail: string): Promise<(TeamImpersonation & { personId: string }) | null> {
  const sessionId = (await cookies()).get(TEAM_ASSUME_COOKIE)?.value;
  if (!sessionId) return null;
  const { data, error } = await companyOs
    .from("portal_assume_sessions")
    .select("id, person_id, started_by, expires_at, ended_at, surface")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("[team-assume] session lookup failed:", error.message);
    return null;
  }
  const session = data as SessionRow | null;
  if (!session || session.surface !== "team" || session.ended_at || session.started_by !== adminEmail) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;
  // A grant revoked mid-session ends the session with it.
  if (!(await holdsSuperAdminGrant(adminEmail))) return null;
  return { adminEmail, sessionId: session.id, expiresAt: session.expires_at, personId: session.person_id };
}

/** True when this request is a server action or a form post, rather than a page being read. */
export async function isWriteRequest(): Promise<boolean> {
  try {
    const h = await headers();
    if (h.get("next-action")) return true;
    const type = h.get("content-type") ?? "";
    return type.startsWith("multipart/form-data") || type.startsWith("application/x-www-form-urlencoded");
  } catch {
    return false;
  }
}

export const READ_ONLY_WHILE_ASSUMING = "You are viewing the Team pages as someone else, which is read-only. Exit the view to make changes.";

/** Refuses a write made while the Team pages are assumed. Reading is allowed; acting as someone else never is. */
export async function refuseWritesWhileAssuming(impersonation: TeamImpersonation | null | undefined): Promise<void> {
  if (impersonation && (await isWriteRequest())) throw new Error(READ_ONLY_WHILE_ASSUMING);
}
