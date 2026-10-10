// Everyone below one team member in the org chart.
//
// The actor's teamMemberScope is deliberately one level deep (self plus direct
// reports) because that is the right read scope for leave, ideas and equipment.
// A manager's onboarding board is different: a hire two levels down is still
// their hire, and the plan-link nag goes to whoever is on the card as manager,
// so a director needs to see the whole subtree to know a plan is missing. This
// walks manager_id down from one root and lives in kernel/identity beside the
// other reporting-line lookups (manager.ts), so no entity has to own the tree.
import { companyOs } from "@/kernel/data/supabase";
import { PORTAL_STATUSES } from "./team-auth";

export type ReportingEdge = { id: string; manager_id: string | null };

// Pure walk: the root followed by every member whose manager chain reaches it,
// in breadth-first order. A cycle in manager_id (bad data) terminates because a
// visited id is never queued twice.
export function collectReportingSubtree(rows: ReportingEdge[], rootId: string): string[] {
  const byManager = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.manager_id) continue;
    const arr = byManager.get(r.manager_id) ?? [];
    arr.push(r.id);
    byManager.set(r.manager_id, arr);
  }
  const seen = new Set<string>([rootId]);
  const order = [rootId];
  for (let i = 0; i < order.length; i += 1) {
    for (const child of byManager.get(order[i]) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      order.push(child);
    }
  }
  return order;
}

// The root plus every portal-status team member under it. Reads the whole
// reporting graph in one query rather than one round trip per level; the table
// is a few hundred rows at most.
export async function getReportingSubtreeIds(rootTeamMemberId: string): Promise<string[]> {
  const { data, error } = await companyOs
    .from("team_members")
    .select("id, manager_id")
    .in("status", PORTAL_STATUSES);
  if (error) {
    console.error("[identity/org-tree] team_members", error.message);
    return [rootTeamMemberId];
  }
  return collectReportingSubtree((data ?? []) as ReportingEdge[], rootTeamMemberId);
}
