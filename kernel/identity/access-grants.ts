// The rules of Settings → Access (ADR 0013), as pure functions so each refusal
// is tested on its own and the screen and the actions ask the same question.
//
// The ADR's rule is that whoever grants a role must hold it and hold
// access.manage, so that nobody hands out more than they have. Read as "be a
// holder of that role", it would lock out a role nobody holds yet (a new
// one-person role) and every module role a Super Admin does not hold by name.
// So "hold it" is read as the reason gives it: the granter holds every
// permission the role carries, at a scope at least as wide. The same rule
// governs adding a permission to a role.
//
// Since AC.20 Admin and Super Admin are granted here like any role, under the
// same rule, and these grants are the only register the admin gate reads. Two
// revokes are refused because they cannot be undone from this screen: taking
// Admin or Super Admin from yourself, and revoking the last Super Admin grant,
// which would leave nobody able to manage access. The permissions those two
// roles carry still change only with the code that declares them.
//
// AE.2 exempts Super Admin from the hold rule: a Super Admin may grant any role
// and add or remove any declared atom on any role that is not locked, without
// holding it. The rule exists to stop a granter escalating others past
// themselves, and Super Admin is the ceiling. Everyone else is bound as before.
import type { RolePermission, Scope } from "@/kernel/identity/access-model";

/**
 * The locked roles: the kernel's declared bundles (kernel/identity/permissions.ts),
 * which the admin gate reads and whose atoms change only with that declaration.
 * A test pins this list to the declaration's.
 */
export const LOCKED_ROLES: ReadonlySet<string> = new Set(["admin", "super-admin"]);
const LOCKED_REFUSAL = "The Admin and Super Admin roles change with the code that declares them, not here.";

/**
 * Whether the person whose pairs these are holds Super Admin. `heldBy` tags
 * each pair with the role that gives it, and Super Admin always carries
 * access.manage by declaration, so a live Super Admin shows up here.
 */
function isSuperAdmin(pairs: readonly RolePermission[]): boolean {
  return pairs.some((p) => p.role === "super-admin");
}

/** Whether holding a permission at `held` reaches as far as `wanted`. */
export function scopeCovers(held: Scope, wanted: Scope): boolean {
  if (held === "all" || held === wanted) return true;
  // Team and clients both include the person themselves, so either covers own.
  return wanted === "own" && (held === "team" || held === "clients");
}

/** Whether the granter's pairs cover one permission at one scope. */
export function holdsAtLeast(granter: readonly RolePermission[], permission: string, scope: Scope): boolean {
  return granter.some((p) => p.permission === permission && scopeCovers(p.scope, scope));
}

/** The role a rule is asked about. */
export type RoleShape = { readonly key: string; readonly kind: "granted" | "implied"; readonly archived: boolean };

/**
 * Why the granter may not grant this role, or null when they may. `granter` is
 * every permission the granter's roles hold; `rolePermissions` what the role
 * carries.
 */
export function grantRefusal(
  role: RoleShape,
  rolePermissions: readonly RolePermission[],
  granter: readonly RolePermission[],
): string | null {
  if (!holdsAtLeast(granter, "access.manage", "all")) return "Only someone who manages access may grant a role.";
  if (role.archived) return "This role is archived and grants nothing.";
  if (role.kind === "implied") return "This role follows a fact about the person; it cannot be granted by hand.";
  if (isSuperAdmin(granter)) return null;
  const missing = rolePermissions.filter((p) => !holdsAtLeast(granter, p.permission, p.scope));
  if (missing.length > 0) {
    return `You may grant only what you hold yourself. You do not hold ${missing.map((p) => `${p.permission} (${p.scope})`).join(", ")}.`;
  }
  return null;
}

/** What a revoke is asked about beyond the role: whose grant it is, and how many Super Admins are left. */
export type RevokeFacts = {
  /** Every person row of the person revoking: one human can have two (B.28), and each is "yourself". */
  readonly granterPersonIds: readonly string[];
  /** The person the grant belongs to. */
  readonly granteePersonId: string;
  /** Live Super Admin grants right now, the one being revoked included. */
  readonly liveSuperAdmins: number;
};

/** Why the granter may not revoke this grant, or null when they may. */
export function revokeRefusal(role: RoleShape, granter: readonly RolePermission[], facts: RevokeFacts): string | null {
  if (!holdsAtLeast(granter, "access.manage", "all")) return "Only someone who manages access may revoke a role.";
  if (role.kind === "implied") return "This role follows a fact about the person; change the fact, not the role.";
  if (LOCKED_ROLES.has(role.key) && facts.granterPersonIds.includes(facts.granteePersonId)) {
    return "You can't remove yourself — ask another Super Admin.";
  }
  if (role.key === "super-admin" && facts.liveSuperAdmins <= 1) {
    return "This is the last Super Admin grant. Grant Super Admin to someone else first, so someone can still manage access.";
  }
  return null;
}

/**
 * Why the editor may not give this role this permission, or null when they may.
 * `declared` is every permission an installed area declares: a key nobody
 * declares would grant nothing, and a typo must not pass for a permission.
 */
export function addPermissionRefusal(
  role: RoleShape,
  permission: string,
  scope: Scope,
  declared: ReadonlySet<string>,
  editor: readonly RolePermission[],
): string | null {
  if (!holdsAtLeast(editor, "access.manage", "all")) return "Only someone who manages access may change a role.";
  if (!declared.has(permission)) return `No installed area declares "${permission}".`;
  if (role.archived) return "This role is archived.";
  if (LOCKED_ROLES.has(role.key)) return LOCKED_REFUSAL;
  if (!isSuperAdmin(editor) && !holdsAtLeast(editor, permission, scope)) return `You may add only what you hold yourself: ${permission} at ${scope}.`;
  return null;
}

/** Why the editor may not take this permission off this role, or null when they may. */
export function removePermissionRefusal(role: RoleShape, editor: readonly RolePermission[]): string | null {
  if (!holdsAtLeast(editor, "access.manage", "all")) return "Only someone who manages access may change a role.";
  if (LOCKED_ROLES.has(role.key)) return LOCKED_REFUSAL;
  return null;
}

/** A role key from a name the person typed: "Reimbursement approver" → "reimbursement-approver". */
export function roleKeyFrom(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "r-$1");
}

/** Who a role is being granted to, as far as the Super Admin rule asks: the employment types of their current team rows. */
export type Grantee = { readonly employmentTypes: readonly string[] };

/** The employment types Super Admin may go to. */
const SUPER_ADMIN_TYPES: ReadonlySet<string> = new Set(["full_time", "part_time", "intern"]);

export const SUPER_ADMIN_GRANTEE_REFUSAL = "Super Admin goes only to a full-time, part-time or intern team member.";

/**
 * Why this person may not be given this role, or null when they may. Only
 * Super Admin is restricted: it goes to a current full-time, part-time or
 * intern team member (spec 2026-10-07, which replaced the earlier rule that
 * also kept Admin from contractors). Admin and every other role may go to a
 * contractor, temp or advisor like anyone else in the register.
 */
export function granteeRefusal(roleKey: string, grantee: Grantee): string | null {
  if (roleKey !== "super-admin") return null;
  return grantee.employmentTypes.some((t) => SUPER_ADMIN_TYPES.has(t)) ? null : SUPER_ADMIN_GRANTEE_REFUSAL;
}
