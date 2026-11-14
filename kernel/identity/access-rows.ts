// The access tables as the resolver reads them (ADR 0013): which permissions
// each role holds, which roles a person was granted, and which person an auth
// user is. Kept apart from the session gates so that the resolver for the
// signed-in person (access-request.ts) and the one for any person
// (access-of-person.ts) read the same rows without importing each other.
//
// Every read here decides what a person may do, so a failure refuses (A.12).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { perRender } from "@/kernel/identity/per-render";
import type { RoleHolding, RolePermission, Scope } from "@/kernel/identity/access-model";

/**
 * Every unarchived role, id and key, read once per request. The grants, the
 * roles a person holds and the permissions of those roles each needed it, so
 * one guarded request read access_roles nine or ten times (SR.1.6). Read per
 * request rather than cached across requests, so an archived role stops
 * counting on the next request, as before. A failed read raises.
 */
export const liveRoles = perRender(async (): Promise<{ id: string; key: string }[]> =>
  mustRows(await companyOs.from("access_roles").select("id, key").is("archived_at", null), "[access] access_roles"),
);

/** The live permissions of the given roles: unarchived roles, unrevoked rows. */
export async function rolePermissionsFromDb(roles: readonly string[]): Promise<RolePermission[]> {
  if (roles.length === 0) return [];
  const wanted = new Set(roles);
  const live = (await liveRoles()).filter((r) => wanted.has(r.key));
  if (live.length === 0) return [];
  const keyOf = new Map(live.map((r) => [r.id, r.key]));
  const rows = mustRows(
    await companyOs
      .from("access_role_permissions")
      .select("role_id, permission, scope")
      .in("role_id", [...keyOf.keys()])
      .is("revoked_at", null),
    "[access] access_role_permissions",
  );
  return rows.map((r) => ({ role: keyOf.get(r.role_id) ?? "", permission: r.permission, scope: r.scope as Scope }));
}

/** The roles granted to a person in Settings, Access: live grants of unarchived roles, with why. */
export async function assignedRoles(personId: string): Promise<RoleHolding[]> {
  // The grants and the role catalogue do not depend on each other (SR.1.6).
  const [grantsRes, roles] = await Promise.all([
    companyOs.from("access_role_assignments").select("role_id, reason").eq("person_id", personId).is("revoked_at", null),
    liveRoles(),
  ]);
  const grants = mustRows(grantsRes, "[access] access_role_assignments");
  if (grants.length === 0) return [];
  const keyOf = new Map(roles.map((r) => [r.id, r.key]));
  return grants.filter((g) => keyOf.has(g.role_id)).map((g) => ({ role: keyOf.get(g.role_id) as string, because: `was granted it: ${g.reason}` }));
}

/**
 * The people.id linked to an auth user, or null. Identity by auth_user_id, never
 * by email. It finds the person behind a sign-in that neither the team gate nor
 * the portal gate recognises: someone whose only way in is a role granted in
 * Settings, Access, such as a custom role carrying surface.admin (ADR 0014).
 */
export async function personIdForAuthUser(authUserId: string): Promise<string | null> {
  const rows = mustRows(await companyOs.from("people").select("id").eq("auth_user_id", authUserId).limit(1), "[access] people (auth user)");
  return rows[0]?.id ?? null;
}
