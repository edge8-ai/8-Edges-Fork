"use server";

// The portal's Assume exit, which the kernel's portal shell takes as a slot
// (ADR 0025): the banner's Exit and the account menu while impersonating. It
// used to live in routes/(dashboard)/actions.ts beside the sign-out, which
// moved to kernel/identity/sign-out.ts when the three copies became one.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { ASSUME_COOKIE } from "@/kernel/identity/portal-auth";
import { updatePortalAssumeSessions } from "@/kernel/identity/writes";

// Ends an Assume session (the "Exit" control on the impersonation banner, and
// the sidebar's sign-out button while impersonating — see PortalSidebar).
// requirePermission("surface.admin") reads the admin's REAL Supabase session,
// which was never touched by starting the Assume session (the access it
// resolves never counts the client being viewed), so this correctly identifies
// the admin regardless of which client identity /portal is currently rendering.
export async function endAssumeSession() {
  const { user: admin } = await requirePermission("surface.admin");
  const sessionId = (await cookies()).get(ASSUME_COOKIE)?.value;
  if (sessionId) {
    await updatePortalAssumeSessions({ ended_at: new Date().toISOString(), ended_by: "admin" })
      .eq("id", sessionId)
      .eq("started_by", admin.email)
      .is("ended_at", null);
    await recordAudit({
      table: "portal_assume_sessions",
      recordId: sessionId,
      operation: "update",
      actor: admin.email,
      context: { action: "assume_end" },
    });
  }
  (await cookies()).delete(ASSUME_COOKIE);
  redirect("/admin");
}
