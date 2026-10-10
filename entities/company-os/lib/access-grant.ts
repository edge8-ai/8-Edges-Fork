// The one place a role is handed to a person (ADR 0013). Settings → Access and
// the team invite both grant through grantRoleTo, so the rule is the same on
// both: the granter must hold access.manage and every permission the role
// carries (kernel/identity/access-grants.ts), an implied, archived or
// admin-screen role is refused, and every grant is audited.
//
// Nothing here asks who is calling: the caller has already passed its own guard
// (requirePermission("access.manage") on the Settings → Access action, the
// admin guard on the invite) and hands the resulting access in. An export that
// skipped the guard would be a way round it, which is why this is a lib file
// and not a server action.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { recordAudit } from "@/kernel/audit/audit";
import { rolePermissionsFromDb } from "@/kernel/identity/access-rows";
import type { RequestAccess } from "@/kernel/identity/access-request";
import {
  addPermissionRefusal,
  grantRefusal,
  granteeRefusal,
  revokeRefusal,
  roleKeyFrom,
  type Grantee,
  type RoleShape,
} from "@/kernel/identity/access-grants";
import type { RolePermission, Scope } from "@/kernel/identity/access-model";
import { liveGrantCount, personIdsByEmail } from "@/kernel/identity/admin-register";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import {
  insertAccessRoleAssignments,
  insertAccessRolePermissions,
  insertAccessRoles,
  updateAccessRoleAssignments,
} from "@/kernel/identity/writes";

/** Every permission the signed-in person's roles hold, at its scope. */
export async function heldBy(access: RequestAccess): Promise<RolePermission[]> {
  return rolePermissionsFromDb([...new Set(access.roles.map((r) => r.role))]);
}

export type RoleRow = RoleShape & { id: string; name: string };

/** One role and the permissions it carries now; null when it does not exist. */
export async function loadRole(roleId: string): Promise<{ role: RoleRow; permissions: RolePermission[] } | null> {
  const [roles, pairs] = await Promise.all([
    companyOs.from("access_roles").select("id, key, name, kind, archived_at").eq("id", roleId).limit(1),
    companyOs.from("access_role_permissions").select("permission, scope").eq("role_id", roleId).is("revoked_at", null),
  ]);
  const row = mustRows(roles, "[access] access_roles")[0];
  if (!row) return null;
  const role: RoleRow = { id: row.id, key: row.key, name: row.name, kind: row.kind as RoleShape["kind"], archived: row.archived_at !== null };
  const permissions = mustRows(pairs, "[access] access_role_permissions").map((p) => ({ role: row.key, permission: p.permission, scope: p.scope as Scope }));
  return { role, permissions };
}

/**
 * The employment types of the person's current team rows: what the Super Admin
 * rule asks (granteeRefusal). A failed read raises, because "not on the team"
 * would refuse wrongly and a guessed type could admit.
 */
async function granteeOf(personId: string): Promise<Grantee> {
  const rows = mustRows(
    await companyOs
      .from("team_members")
      .select("employment_type")
      .eq("person_id", personId)
      .in("status", ["active", "on_leave", "notice"]),
    "[access] team_members of the grantee",
  );
  return { employmentTypes: rows.map((r) => r.employment_type) };
}

export type GrantOutcome =
  | { ok: true; message: string; roleName: string; roleKey: string; assignmentId: string }
  | { ok: false; error: string; roleName: string | null };

/**
 * Grant one role to one person, as `access`. `reason` is what the grant row
 * records, or a function of the role when the reason is built from its name.
 * Refusals come back as a result naming the role (null when it no longer
 * exists), never a throw, so a caller granting several can report each one.
 */
export async function grantRoleTo(input: {
  access: RequestAccess;
  personId: string;
  roleId: string;
  reason: string | ((role: { name: string }) => string);
}): Promise<GrantOutcome> {
  const { access, personId, roleId } = input;
  const found = await loadRole(roleId);
  if (!found) return { ok: false, error: "That role no longer exists.", roleName: null };
  const refusal = grantRefusal(found.role, found.permissions, await heldBy(access));
  if (refusal) return { ok: false, error: refusal, roleName: found.role.name };
  if (found.role.key === "super-admin") {
    const notEligible = granteeRefusal(found.role.key, await granteeOf(personId));
    if (notEligible) return { ok: false, error: notEligible, roleName: found.role.name };
  }

  const reason = typeof input.reason === "function" ? input.reason(found.role) : input.reason;
  const { data, error } = await insertAccessRoleAssignments({
    person_id: personId,
    role_id: found.role.id,
    granted_by: access.personId,
    reason,
  })
    .select("id")
    .single();
  if (error) {
    // The live-grant unique index: they already hold it.
    if (error.code === "23505") return { ok: false, error: `They already hold ${found.role.name}.`, roleName: found.role.name };
    return { ok: false, error: `Could not grant the role: ${error.message}`, roleName: found.role.name };
  }
  await recordAudit({
    table: "access_role_assignments",
    recordId: data.id,
    operation: "insert",
    actor: access.user.email,
    newData: { person_id: personId, role: found.role.key, reason },
  });
  return { ok: true, message: `${found.role.name} granted.`, roleName: found.role.name, roleKey: found.role.key, assignmentId: data.id };
}

export type GrantableRole = { id: string; key: string; name: string; description: string };

/**
 * The roles `access` may grant right now: granted (not implied), live, and
 * carrying nothing the granter does not hold. The invite form offers these. A
 * person who may not manage access gets none, because grantRefusal refuses
 * every role to them.
 */
export async function loadGrantableRoles(access: RequestAccess): Promise<GrantableRole[]> {
  const [roles, pairs] = await Promise.all([
    companyOs.from("access_roles").select("id, key, name, description, kind, archived_at").eq("kind", "granted").is("archived_at", null).order("name"),
    companyOs.from("access_role_permissions").select("role_id, permission, scope").is("revoked_at", null),
  ]);
  const roleRows = mustRows(roles, "[access] access_roles");
  const pairRows = mustRows(pairs, "[access] access_role_permissions");
  const held = await heldBy(access);
  return roleRows
    .filter((r) => {
      const carried = pairRows
        .filter((p) => p.role_id === r.id)
        .map((p) => ({ role: r.key, permission: p.permission, scope: p.scope as Scope }));
      const shape: RoleShape = { key: r.key, kind: r.kind as RoleShape["kind"], archived: r.archived_at !== null };
      return grantRefusal(shape, carried, held) === null;
    })
    .map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description }));
}

export type AccessWrite = { ok: true; message: string; id: string } | { ok: false; error: string };

/**
 * Create a granted role with no permissions yet, as `access`. Settings →
 * Access's "New role" and the invite's custom shape both create through here.
 */
export async function createRoleAs(access: RequestAccess, name: string, description: string): Promise<AccessWrite> {
  const key = roleKeyFrom(name);
  if (!key) return { ok: false, error: "Give the role a name made of words." };
  const { data, error } = await insertAccessRoles({ key, name, description, kind: "granted" }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `A role called ${key} already exists.` };
    return { ok: false, error: `Could not create the role: ${error.message}` };
  }
  await recordAudit({ table: "access_roles", recordId: data.id, operation: "insert", actor: access.user.email, newData: { key, name } });
  return { ok: true, message: `${name} created. Give it permissions, then grant it.`, id: data.id };
}

/** Add one declared permission to a role at a scope, as `access`, under the hold rule. */
export async function addRolePermissionAs(access: RequestAccess, roleId: string, permission: string, scope: Scope): Promise<AccessWrite> {
  const found = await loadRole(roleId);
  if (!found) return { ok: false, error: "That role no longer exists." };
  const declared = new Set(Object.keys(permissionRegistry().atoms));
  const refusal = addPermissionRefusal(found.role, permission, scope, declared, await heldBy(access));
  if (refusal) return { ok: false, error: refusal };

  const { data, error } = await insertAccessRolePermissions({ role_id: found.role.id, permission, scope, created_by: access.personId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `${found.role.name} already holds ${permission}; take it off first to change its reach.` };
    return { ok: false, error: `Could not add the permission: ${error.message}` };
  }
  await recordAudit({
    table: "access_role_permissions",
    recordId: data.id,
    operation: "insert",
    actor: access.user.email,
    newData: { role: found.role.key, permission, scope },
  });
  return { ok: true, message: `${found.role.name} now holds ${permission}.`, id: data.id };
}

/**
 * End one live grant with a reason, as `access`. Settings → Access's revoke and
 * the invite's Cancel both end grants through here, so nobody takes Admin or
 * Super Admin from themselves and the last Super Admin grant stays.
 */
export async function revokeGrantAs(access: RequestAccess, assignmentId: string, reason: string): Promise<AccessWrite> {
  const grant = mustRows(
    await companyOs.from("access_role_assignments").select("id, person_id, role_id, revoked_at").eq("id", assignmentId).limit(1),
    "[access] access_role_assignments",
  )[0];
  if (!grant || grant.revoked_at) return { ok: false, error: "That grant is no longer live." };
  const found = await loadRole(grant.role_id);
  if (!found) return { ok: false, error: "That role no longer exists." };
  // Both facts raise on a failed read: "not yourself" and "not the last one"
  // are the permissive answers, so a hiccup must not produce them.
  const [granterPersonIds, liveSuperAdmins, granter] = await Promise.all([
    personIdsByEmail(access.user.email),
    liveGrantCount("super-admin"),
    heldBy(access),
  ]);
  const refusal = revokeRefusal(found.role, granter, {
    granterPersonIds: access.personId ? [access.personId, ...granterPersonIds] : granterPersonIds,
    granteePersonId: grant.person_id,
    liveSuperAdmins,
  });
  if (refusal) return { ok: false, error: refusal };

  const { error } = await updateAccessRoleAssignments({
    revoked_at: new Date().toISOString(),
    revoked_by: access.personId,
    revoke_reason: reason,
  })
    .eq("id", grant.id)
    .is("revoked_at", null);
  if (error) return { ok: false, error: `Could not revoke the grant: ${error.message}` };
  // The last-Super-Admin check above read a count, then revoked: two revokes at
  // the same moment could both pass it. So count again after the write; if no
  // Super Admin is left, this revoke lost the race and is put back. Someone can
  // always manage access, without a database trigger.
  if (found.role.key === "super-admin" && (await liveGrantCount("super-admin")) === 0) {
    const { error: undoError } = await updateAccessRoleAssignments({ revoked_at: null, revoked_by: null, revoke_reason: null }).eq("id", grant.id);
    if (undoError) {
      return { ok: false, error: `No Super Admin would be left, and the revoke could not be undone (${undoError.message}). Grant Super Admin again at once.` };
    }
    return { ok: false, error: "Another Super Admin grant was revoked at the same moment, so this one stays: someone must always be able to manage access." };
  }
  await recordAudit({
    table: "access_role_assignments",
    recordId: grant.id,
    operation: "update",
    actor: access.user.email,
    oldData: { revoked_at: null },
    newData: { person_id: grant.person_id, role: found.role.key, revoked: true, reason },
  });
  return { ok: true, message: `${found.role.name} revoked. It ends on their next page load.`, id: grant.id };
}
