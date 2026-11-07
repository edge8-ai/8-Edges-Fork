// What a person may do, from the roles they hold (ADR 0013). Pure: the resolver
// reads the rows and the relationships, and this turns them into an answer, so
// the rule can be tested on its own and every guard asks the same question.
//
// The rule is a union. Each role a person holds contributes its permissions, and
// each permission reaches as far as its scope allows: own (the person), team
// (the person and their reports), clients (the companies they are assigned to),
// all (everyone and every company). Where two roles give the same permission,
// the reaches add up. No role takes anything away, so "why may Anna see this"
// always has a one-line answer: the role that gave it.

export type Scope = "own" | "team" | "clients" | "all";

/** A role a person holds, and why: the grant's reason, or the fact that implies it. */
export type RoleHolding = { readonly role: string; readonly because: string };

/** One permission one role holds, at a scope (a live row of access_role_permissions, or a default). */
export type RolePermission = { readonly role: string; readonly permission: string; readonly scope: Scope };

/** The relationships a scope resolves against, all for the person being resolved. */
export type Relationships = {
  readonly personId: string;
  /** The people.id of everyone who reports to them. */
  readonly reportIds: readonly string[];
  /** The companies.id of every client they are assigned to. */
  readonly clientIds: readonly string[];
};

/** What a permission is being asked about: a person's record, a company's, or neither. */
export type Target = { readonly person?: string; readonly company?: string };

export type Access = {
  readonly roles: readonly RoleHolding[];
  /** Every permission held, sorted. */
  permissions(): string[];
  /**
   * Whether the person holds `permission` and, when a target is named, whether
   * its reach covers that person or company. With no target, holding the
   * permission at any scope is enough.
   */
  may(permission: string, target?: Target): boolean;
};

type Reach = { all: boolean; people: Set<string>; companies: Set<string> };

/**
 * The view atom a manage atom implies, or null (AE.1). An atom that differs
 * between seeing and controlling is declared as a pair,
 * `<entity>.<thing>.view` and `<entity>.<thing>.manage`, and holding manage
 * reaches view at the same scope, so a role lists one atom and gets both. Only
 * the three-part form is a pair: `access.manage` is an atom of its own, and the
 * generator refuses a manage whose view is not declared.
 */
export function viewOf(permission: string): string | null {
  const m = /^([a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)\.manage$/.exec(permission);
  return m ? `${m[1]}.view` : null;
}

export function resolveAccess(
  roles: readonly RoleHolding[],
  rolePermissions: readonly RolePermission[],
  relationships: Relationships,
): Access {
  const held = new Set(roles.map((r) => r.role));
  const reach = new Map<string, Reach>();
  const reachOf = (permission: string): Reach => {
    const r = reach.get(permission) ?? { all: false, people: new Set<string>(), companies: new Set<string>() };
    reach.set(permission, r);
    return r;
  };
  for (const rp of rolePermissions) {
    if (!held.has(rp.role)) continue;
    const view = viewOf(rp.permission);
    for (const permission of view ? [rp.permission, view] : [rp.permission]) addReach(reachOf(permission), rp.scope, relationships);
  }
  return {
    roles,
    permissions: () => [...reach.keys()].sort(),
    may(permission, target) {
      const r = reach.get(permission);
      if (!r) return false;
      if (r.all || !target) return true;
      if (target.person !== undefined && r.people.has(target.person)) return true;
      if (target.company !== undefined && r.companies.has(target.company)) return true;
      return false;
    },
  };
}

/** Widen one permission's reach by what a scope covers for this person. */
function addReach(r: Reach, scope: Scope, relationships: Relationships): void {
  switch (scope) {
    case "all":
      r.all = true;
      break;
    case "clients":
      r.people.add(relationships.personId);
      for (const id of relationships.clientIds) r.companies.add(id);
      break;
    case "team":
      r.people.add(relationships.personId);
      for (const id of relationships.reportIds) r.people.add(id);
      break;
    case "own":
      r.people.add(relationships.personId);
      break;
  }
}
