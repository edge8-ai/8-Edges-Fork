"use server";

// Team assume's two controls, on Settings → Assume (docs/plans/2026-10-10-
// contractor-portal.md, PR 2): start viewing the Team pages as one team
// member, and end it. The session itself is read back by the kernel
// (kernel/identity/team-assume.ts), which is what makes the Team pages render
// as that person and refuse every write while they do.
import { cookies } from "next/headers";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { ASSUME_SESSION_MINUTES } from "@/kernel/identity/portal-auth";
import { PORTAL_STATUSES } from "@/kernel/identity/team-statuses";
import { TEAM_ASSUME_COOKIE, TEAM_ASSUME_PATH } from "@/kernel/identity/team-assume";
import { insertPortalAssumeSessions, updatePortalAssumeSessions } from "@/kernel/identity/writes";
import type { Result } from "@/kernel/data/result";

// Both controls return rather than redirect: /admin and /team are separate
// root layouts, and a server action's redirect across them is a client-side
// navigation that stalls. The caller loads the next page in full instead.

/** Opens /team as `personId` sees it, for ASSUME_SESSION_MINUTES; the caller then loads /team. */
export async function startTeamAssume(personId: string): Promise<Result> {
  // asSignedIn: an admin already viewing someone may switch to someone else.
  const { user: admin } = await requirePermission("team.assume", undefined, { asSignedIn: true });
  if (!personId) return { ok: false, error: "Pick a team member." };

  // Only someone who could sign in to /team themselves can be viewed as.
  const { data: member, error: memberErr } = await companyOs
    .from("team_members")
    .select("id")
    .eq("person_id", personId)
    .in("status", PORTAL_STATUSES)
    .limit(1)
    .maybeSingle();
  if (memberErr) return { ok: false, error: memberErr.message };
  if (!member) return { ok: false, error: "That person is not on the team." };

  const expiresAt = new Date(Date.now() + ASSUME_SESSION_MINUTES * 60 * 1000);
  const { data: session, error } = await insertPortalAssumeSessions({
    surface: "team",
    company_id: null,
    person_id: personId,
    started_by: admin.email,
    expires_at: expiresAt.toISOString(),
  })
    .select("id")
    .single();
  if (error || !session) return { ok: false, error: error?.message ?? "Could not start the session." };

  // Scoped to /team: the Admin view and /api keep the admin's own identity.
  (await cookies()).set(TEAM_ASSUME_COOKIE, session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: TEAM_ASSUME_PATH,
    expires: expiresAt,
  });

  await recordAudit({
    table: "portal_assume_sessions",
    recordId: session.id,
    operation: "insert",
    actor: admin.email,
    context: { action: "team_assume_start", person_id: personId },
  });
  return { ok: true };
}

/** Ends every open team session the signed-in admin started, and clears the cookie; the caller then loads Settings → Assume. */
export async function endTeamAssume(): Promise<Result> {
  const { user: admin } = await requirePermission("team.assume", undefined, { asSignedIn: true });
  const { data: ended, error } = await updatePortalAssumeSessions({ ended_at: new Date().toISOString(), ended_by: admin.email })
    .eq("surface", "team")
    .eq("started_by", admin.email)
    .is("ended_at", null)
    .select("id");
  if (error) return { ok: false, error: `Could not end the session: ${error.message}` };
  (await cookies()).set(TEAM_ASSUME_COOKIE, "", { path: TEAM_ASSUME_PATH, expires: new Date(0) });
  for (const row of ended ?? []) {
    await recordAudit({
      table: "portal_assume_sessions",
      recordId: row.id,
      operation: "update",
      actor: admin.email,
      context: { action: "team_assume_end" },
    });
  }
  return { ok: true };
}
