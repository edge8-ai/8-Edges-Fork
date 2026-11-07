// Server-only admin auth gate. NEVER import from a client component.
//
// A request is "admin" iff it carries a valid Supabase session AND the person
// signed in holds surface.admin (ADR 0014). The Admin role gives that atom by
// declaration, so every Admin and Super Admin grant still opens the Admin view,
// and so does any role a Super Admin composes with it, such as Accountant.
// Which register facts give the Admin role (the grants in Settings, Access and
// the ADMIN_ALLOWLIST bootstrap) lives in admin-register.ts; what a role holds
// lives in access_role_permissions; this module only asks the resolver.
//
// company_os has RLS ENABLED with no policies and no grants to the
// browser/publishable key, so that key can read nothing there; all data flows
// through the service-role client (kernel/data/supabase), which bypasses RLS.
// The guards (requirePermission at the top of every page and server action,
// and the surface atom in each layout) are therefore the security boundary.
//
// Both functions here are thin wrappers kept so their callers keep working
// while they move to requirePermission on the atom each one actually needs.
import { getAccess, requirePermission } from "@/kernel/identity/access-request";
import { perRender } from "@/kernel/identity/per-render";
import type { SessionUser } from "@/kernel/identity/session-user";

export type AdminUser = SessionUser;

// Returns the signed-in person when they hold surface.admin, or null if nobody
// is signed in or they do not. The session is revalidated against GoTrue on
// every request (session-user.ts): the proxy matcher does not cover /api, yet
// API routes call this, and entities/assistant/lib/admin-chat/privileged.ts
// treats a single email address as the write-privileged user, so a forged
// cookie must never be trusted here. Once per render, like the resolver.
export const getAdminUser = perRender(async (): Promise<AdminUser | null> => {
  const access = await getAccess();
  return access?.may("surface.admin") ? access.user : null;
});

// The Admin view's guard: requirePermission("surface.admin"), handing back the
// signed-in user as it always has. Nobody signed in goes to /admin/login;
// someone signed in without the atom is recorded and refused like any page.
export async function requireAdmin(): Promise<AdminUser> {
  return (await requirePermission("surface.admin")).user;
}
