"use server";

// The two portal session actions that the shared chrome needs (PortalSidebar
// and AssumeBanner, both under entities/portal/ui/). They used to live in
// routes/(dashboard)/actions.ts, which made shared UI reach into a route
// folder; a route is a mount, not a module other code may import, so the
// actions live here and the route folder keeps only page-scoped actions.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { signOutTo } from "@/kernel/identity/session";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { ASSUME_COOKIE } from "@/kernel/identity/portal-auth";
import { updatePortalAssumeSessions } from "@/kernel/identity/writes";

// Sign the client contact out and return them to the portal login.
export async function signOut() {
  await signOutTo("/portal/login");
}

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
