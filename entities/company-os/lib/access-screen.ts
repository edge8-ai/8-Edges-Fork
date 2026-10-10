// Data for Settings → Access (ADR 0013, AC.17): every role with the permissions
// it holds and the people it was granted to, and the people a role may be
// granted to. The access tables are the kernel's, readable by every entity and
// written only through kernel/identity/writes.ts. Each permission is labelled
// with its sentence from the deployment's registry; a row naming a permission no
// installed area declares is shown as such, because it grants nothing.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { byFirstName, NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { permissionRegistry } from "@/kernel/identity/permission-registry";
import type { Scope } from "@/kernel/identity/access-model";
import type { PermissionRegistry } from "@/kernel/identity/permission-declaration";

export type AccessRolePermission = {
  id: string;
  permission: string;
  scope: Scope;
  /** The registry's sentence, or null when no installed area declares the key. */
  sentence: string | null;
};

export type AccessGrant = {
  id: string;
  personId: string;
  personName: string;
  reason: string;
  grantedBy: string | null;
  createdAt: string;
};

export type AccessRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  kind: "granted" | "implied";
  archived: boolean;
  permissions: AccessRolePermission[];
  grants: AccessGrant[];
  /** For an implied role: the facts that imply it, in words. */
  impliedBy: string[];
  /**
   * The bundle this deployment declares under the role's key (AE.2), or null
   * for a role made on this screen. The row above is the truth; this is the
   * shape it was seeded from, and `locked` marks Admin and Super Admin.
   */
  declared: { owner: string; sentence: string; locked: boolean } | null;
};

export type AccessPersonOption = { personId: string; name: string };

// The roles the kernel's own registers imply, in the words the resolver gives
// (kernel/identity/access.ts); the entities' impliers come from the registry.
const KERNEL_FACTS: Record<string, string> = {
  "team-member": "is on the team full-time, part-time or as an intern",
  contractor: "is on the team on a contract",
  manager: "has at least one person reporting to them",
  "client-user": "has an active membership of a client company in the portal",
};

type Named = { display_name: string | null; preferred_name: string | null; full_name: string | null; email: string | null };

/** Every role, live ones first, with what it holds and who was granted it. */
export async function loadAccessRoles(): Promise<AccessRole[]> {
  const registry = permissionRegistry();
  const [roles, pairs, grants] = await Promise.all([
    companyOs.from("access_roles").select("id, key, name, description, kind, archived_at").order("name"),
    companyOs.from("access_role_permissions").select("id, role_id, permission, scope").is("revoked_at", null).order("permission"),
    companyOs
      .from("access_role_assignments")
      .select(`id, role_id, person_id, reason, created_at, person:people!person_id(${NAME_COLUMNS}), granter:people!granted_by(${NAME_COLUMNS})`)
      .is("revoked_at", null)
      .order("created_at"),
  ]);
  const roleRows = mustRows(roles, "[access screen] access_roles");
  const pairRows = mustRows(pairs, "[access screen] access_role_permissions");
  const grantRows = mustRows(grants, "[access screen] access_role_assignments");

  return roleRows
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      kind: r.kind as "granted" | "implied",
      archived: r.archived_at !== null,
      permissions: pairRows
        .filter((p) => p.role_id === r.id)
        .map((p) => ({ id: p.id, permission: p.permission, scope: p.scope as Scope, sentence: registry.atoms[p.permission]?.sentence ?? null })),
      grants: grantRows
        .filter((g) => g.role_id === r.id)
        .map((g) => ({
          id: g.id,
          personId: g.person_id,
          personName: personName(g.person as Named | null),
          reason: g.reason,
          grantedBy: g.granter ? personName(g.granter as Named) : null,
          createdAt: g.created_at,
        })),
      impliedBy: [
        ...(KERNEL_FACTS[r.key] ? [KERNEL_FACTS[r.key]] : []),
        ...(registry.implies[r.key] ?? []).map((i) => i.because),
      ],
      declared: declaredBundle(registry.roles[r.key]),
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived));
}

function declaredBundle(bundle: PermissionRegistry["roles"][string] | undefined): AccessRole["declared"] {
  return bundle ? { owner: bundle.owner, sentence: bundle.sentence, locked: bundle.locked } : null;
}

/**
 * Everyone in the people register who is not archived: team members, clients'
 * portal users and contacts alike, because from the Admin view a Super Admin
 * sees it all (Khoa, 2026-10-07). Who may hold Admin is a rule of the grant
 * (kernel/identity/access-grants.ts), not of this list.
 */
export async function loadAccessPeople(): Promise<AccessPersonOption[]> {
  const rows = mustRows(
    await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).is("archived_at", null).limit(5000),
    "[access screen] people",
  );
  return rows
    .map((r) => ({ personId: r.id, name: personName(r as Named) }))
    .sort((a, b) => byFirstName(a.name, b.name));
}

/** Every permission the deployment declares, for the role editor and the permission view. */
export function declaredPermissions(): { key: string; sentence: string; owner: string }[] {
  return Object.entries(permissionRegistry().atoms)
    .map(([key, a]) => ({ key, sentence: a.sentence, owner: a.owner }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
