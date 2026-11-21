// Portal member roles, enforced server-side in every gated helper
// (docs/plans/2026-08-11-client-portal-improvements.md, PR 2).
//
//   admin       everything: invoices, user management, roadmap priorities and
//               ordering, request decisions, plus everything contributor can do
//   contributor propose roadmap items, upload documents, create requests and
//               programs; no reordering, no priorities, no invoices
//   viewer      read-only everywhere
//
// The role rides on PortalActor.memberships (one per company), so a person who
// is admin at one company and viewer at another gets the right powers at each.
// UI hides what a role can't use; these checks are the actual boundary.

import type { PortalActor } from "@/kernel/identity/portal-auth";

export type PortalRole = "admin" | "contributor" | "viewer";

const KNOWN: PortalRole[] = ["admin", "contributor", "viewer"];

// Unknown/legacy values degrade to viewer: fail read-only, never fail open.
function normalize(role: string): PortalRole {
  return (KNOWN as string[]).includes(role) ? (role as PortalRole) : "viewer";
}

export function roleForCompany(actor: PortalActor, companyId: string): PortalRole | null {
  const m = actor.memberships.find((x) => x.companyId === companyId);
  return m ? normalize(m.role) : null;
}

// Full-power check: prioritize/reorder the roadmap, see invoices, decide
// requests, manage users.
export function isPortalAdmin(actor: PortalActor, companyId: string): boolean {
  return roleForCompany(actor, companyId) === "admin";
}

// Write-level check: propose items, upload documents, create requests/programs.
export function canContribute(actor: PortalActor, companyId: string): boolean {
  const r = roleForCompany(actor, companyId);
  return r === "admin" || r === "contributor";
}

// The subset of the actor's companies where they hold a given power. Used to
// scope reads that only some memberships entitle (e.g. invoices → admin only).
export function adminCompanyScope(actor: PortalActor): string[] {
  return actor.memberships
    .filter((m) => m.companyId && normalize(m.role) === "admin")
    .map((m) => m.companyId as string);
}

export function contributorCompanyScope(actor: PortalActor): string[] {
  return actor.memberships
    .filter((m) => m.companyId && normalize(m.role) !== "viewer")
    .map((m) => m.companyId as string);
}

export const ROLE_DENIED = "Your portal role does not allow this. Ask your account admin.";
