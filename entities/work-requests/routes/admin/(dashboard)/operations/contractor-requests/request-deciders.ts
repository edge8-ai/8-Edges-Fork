// Who decided each contractor estimate (S.5 contract). Server-only: it reads
// the approvals, so it lives apart from request-shared.ts, which the client
// shelf imports.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { RequestRow } from "./request-shared";

/**
 * Attaches who decided each request's estimate, read from its approval, since
 * the request row no longer records it (S.5 contract). Shown as the decider's
 * email, as the drawer showed it before. A failed read raises rather than
 * showing every estimate as undecided.
 */
export async function withEstimateDeciders<R extends RequestRow>(rows: R[]): Promise<R[]> {
  if (rows.length === 0) return rows;
  const decisions = mustRows(
    await companyOs
      .from("approvals")
      .select("subject_id, decided_by")
      .eq("subject_type", "contractor_estimate")
      .in("state", ["approved", "rejected"])
      .in("subject_id", rows.map((r) => r.id))
      // Oldest first, so the Map below keeps the latest decision: an estimate
      // sent back for changes and approved later has two.
      .order("decided_at", { ascending: true }),
    "[contractor-requests] estimate decisions",
  );
  const personIds = [...new Set(decisions.map((d) => d.decided_by).filter((id): id is string => !!id))];
  const people = personIds.length
    ? mustRows(await companyOs.from("people").select("id, email").in("id", personIds), "[contractor-requests] deciders")
    : [];
  const emailById = new Map(people.map((p) => [p.id, p.email]));
  const deciderByRequest = new Map(decisions.map((d) => [d.subject_id, d.decided_by ? emailById.get(d.decided_by) ?? null : null]));
  return rows.map((r) => ({ ...r, estimate_decider: deciderByRequest.get(r.id) ?? null }));
}
