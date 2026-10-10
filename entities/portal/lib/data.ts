// The ONLY sanctioned path for /portal code to read company_os. Every /portal
// page and server action must go through here rather than importing the
// service-role `companyOs` client directly — the same ban that entities/team/lib/data.ts
// enforces for /team. Portal users are external client contacts, so an unscoped
// query would leak other clients' data (or Edge8-internal data); funnelling
// reads through one helper that injects the actor's scope filter makes that
// structurally impossible. Unlike /team, there is NO "company-visible" tier
// here: every read is company-scoped or self-scoped, no exceptions.

import { companyOs, companyOsUntyped } from "@/kernel/data/supabase";
import type { PortalActor } from "@/kernel/identity/portal-auth";

// Tables /portal may read, and the column + scope each is filtered on. A table
// not listed here cannot be read from /portal. Expand this deliberately, one
// table per PR, always with an explicit scope key. `company` filters by
// actor.companyScope; `person` by the actor's own person id.
type ScopeKind = "company" | "person";
const SCOPE_ALLOWLIST: Record<string, { column: string; scope: ScopeKind }> = {
  portal_members: { column: "person_id", scope: "person" },
  staff_assignments: { column: "company_id", scope: "company" },
  event_registrations: { column: "person_id", scope: "person" },
  client_backlog_items: { column: "company_id", scope: "company" },
  client_roadmap_groups: { column: "company_id", scope: "company" },
  client_roadmap_overview: { column: "company_id", scope: "company" },
};

function scopeIds(actor: PortalActor, scope: ScopeKind): string[] {
  return scope === "company" ? actor.companyScope : [actor.personId];
}

// Scoped read: returns a query builder already filtered to the actor's scope.
// Chain further .eq/.order/.limit as needed; the scope filter cannot be removed.
// Callers select explicit column lists, never `*` — what a client may see is
// decided per column, not per table (see the design doc's privacy rules).
export function portalRead(
  actor: PortalActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  select: string,
) {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`portalRead: '${table}' is not in the /portal scope allowlist`);
  const ids = scopeIds(actor, cfg.scope);
  return companyOsUntyped.from(table).select(select).in(cfg.column, ids);
}

// Ownership assertion for id-taking mutations: confirms a target row belongs to
// the actor's scope BEFORE the caller mutates it. Closes IDOR — an action must
// never trust a client-supplied id as the authorization subject. Returns the
// row's scope id when in scope, or null when the row is missing or out of scope.
export async function assertInScope(
  actor: PortalActor,
  table: keyof typeof SCOPE_ALLOWLIST,
  id: string,
): Promise<string | null> {
  const cfg = SCOPE_ALLOWLIST[table];
  if (!cfg) throw new Error(`assertInScope: '${table}' is not in the /portal scope allowlist`);
  const { data, error: scopeErr } = await companyOsUntyped.from(table).select(`${cfg.column}`).eq("id", id).maybeSingle();
  if (scopeErr) console.error("[portal/data] assertInScope", table, scopeErr);
  if (!data) return null;
  const owner = (data as unknown as Record<string, string>)[cfg.column];
  return scopeIds(actor, cfg.scope).includes(owner) ? owner : null;
}
