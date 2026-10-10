import { searchFold } from "@/kernel/ui/format";
import type { OpenRole, OrgEntry } from "./directory-shapes";

// The reporting tree as data, shared by the org chart's screens and by the
// server check that guards a reporting-line change. It is built only from
// team_members.manager_id. Everything here is pure so the rules that decide
// who appears where are tested without a browser.

export type OrgModel = {
  byId: Map<string, OrgEntry>;
  /** Direct reports by manager id: employees first, then contractors, each by name. */
  kids: Map<string, OrgEntry[]>;
  /** People with no manager, or whose manager is not on the chart (for example, has left). */
  roots: OrgEntry[];
  /**
   * People no root reaches: a manager loop (A reports to B, B to A) and everyone
   * under it. The chart used to draw only from the roots, so these vanished.
   */
  loose: OrgEntry[];
  rolesFor: (personId: string) => OpenRole[];
  /** Open roles with no hiring manager, or one who is not on the chart. */
  unplacedRoles: OpenRole[];
};

// Contractors sit at the bottom of each manager's list: they are not part of
// the regular 1-1 cadence, so the people a manager runs come first.
const rank = (e: OrgEntry) => (e.employmentType === "contract" ? 1 : 0);
const byRankThenName = (a: OrgEntry, b: OrgEntry) => rank(a) - rank(b) || a.name.localeCompare(b.name);

export function buildOrgModel(entries: OrgEntry[], roles: OpenRole[]): OrgModel {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const kids = new Map<string, OrgEntry[]>();
  const roots: OrgEntry[] = [];
  for (const e of entries) {
    if (e.managerId && byId.has(e.managerId)) kids.set(e.managerId, [...(kids.get(e.managerId) ?? []), e]);
    else roots.push(e);
  }
  for (const [id, list] of kids) kids.set(id, [...list].sort(byRankThenName));
  roots.sort((a, b) => a.name.localeCompare(b.name));

  const reached = new Set<string>();
  const walk = (id: string) => {
    if (reached.has(id)) return;
    reached.add(id);
    for (const k of kids.get(id) ?? []) walk(k.id);
  };
  for (const r of roots) walk(r.id);
  const loose = entries.filter((e) => !reached.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));

  // job_requisitions stores hiring_manager_id against people, not team_members,
  // so a role is matched to the chart through OrgEntry.personId.
  const onChart = new Set(entries.map((e) => e.personId));
  const rolesByPerson = new Map<string, OpenRole[]>();
  const unplacedRoles: OpenRole[] = [];
  for (const r of roles) {
    const key = r.hiringManagerPersonId;
    if (key && onChart.has(key)) rolesByPerson.set(key, [...(rolesByPerson.get(key) ?? []), r]);
    else unplacedRoles.push(r);
  }

  return { byId, kids, roots, loose, rolesFor: (personId) => rolesByPerson.get(personId) ?? [], unplacedRoles };
}

/** A leaf has no reports and no open roles, so the tree can stack it under its manager. */
export function isLeaf(model: OrgModel, entry: OrgEntry): boolean {
  return !(model.kids.get(entry.id)?.length) && model.rolesFor(entry.personId).length === 0;
}

/** Everyone below a person, at any depth. Terminates on a loop. */
export function descendantsOf(model: OrgModel, id: string): Set<string> {
  const out = new Set<string>();
  const go = (x: string) => {
    for (const k of model.kids.get(x) ?? []) {
      if (out.has(k.id)) continue;
      out.add(k.id);
      go(k.id);
    }
  };
  go(id);
  return out;
}

/** The managers above a person, from the top down to their direct manager. Terminates on a loop. */
export function managerChain(model: OrgModel, id: string): OrgEntry[] {
  const chain: OrgEntry[] = [];
  const seen = new Set([id]);
  let cur = model.byId.get(id)?.managerId ?? null;
  while (cur && !seen.has(cur)) {
    const m = model.byId.get(cur);
    if (!m) break;
    seen.add(cur);
    chain.unshift(m);
    cur = m.managerId;
  }
  return chain;
}

/**
 * Whether making `managerId` the manager of `memberId` closes a loop: true when
 * the new manager is the member or already reports up to them. Walks up from
 * the new manager, so a loop already present elsewhere in the data cannot hang
 * the check.
 */
export function wouldCreateLoop(
  edges: ReadonlyArray<{ id: string; managerId: string | null }>,
  memberId: string,
  managerId: string | null,
): boolean {
  if (!managerId) return false;
  const up = new Map(edges.map((e) => [e.id, e.managerId]));
  const seen = new Set<string>();
  let cur: string | null = managerId;
  while (cur && !seen.has(cur)) {
    if (cur === memberId) return true;
    seen.add(cur);
    cur = up.get(cur) ?? null;
  }
  return false;
}

/** The team_members statuses the chart shows; a manager must be one of them. */
export const ON_CHART_STATUSES = ["active", "on_leave", "notice"] as const;

/**
 * Why a reporting-line change must not be saved, or null when it may. The new
 * manager must be on the chart today: a manager who has left lifts the whole
 * team to the top beside the founder with nothing to say why, which is what the
 * Talent picker allowed. And the change must not close a loop, because a loop
 * takes everyone in it off the tree.
 */
export function refuseReportingLine(
  rows: ReadonlyArray<{ id: string; managerId: string | null; status: string | null }>,
  memberId: string,
  managerId: string | null,
): string | null {
  if (!managerId) return null;
  if (managerId === memberId) return "A person can't be their own manager.";
  const manager = rows.find((r) => r.id === managerId);
  if (!manager || !(ON_CHART_STATUSES as readonly string[]).includes(manager.status ?? "")) {
    return "That person is not on the chart today, so they can't be a manager. Pick someone who is here now.";
  }
  if (wouldCreateLoop(rows, memberId, managerId)) {
    return "That person already reports up to this one, so the change would make a loop.";
  }
  return null;
}

/** Search over name, legal name, title, department and city, with or without marks. */
export function matchesQuery(entry: OrgEntry, query: string, location: string): boolean {
  if (location !== "all" && entry.location !== location) return false;
  const q = searchFold(query.trim());
  if (!q) return true;
  const hay = [entry.name, entry.legalName, entry.positionTitle, entry.departmentName, entry.location]
    .filter(Boolean)
    .join(" ");
  return searchFold(hay).includes(q);
}
