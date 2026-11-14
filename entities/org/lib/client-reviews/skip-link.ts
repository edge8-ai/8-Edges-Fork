import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { isUuid } from "@/kernel/config/slug";
import { recordAudit } from "@/kernel/audit/audit";
import { newLinkToken } from "./open-cycle";

// The owner's hold on the skip-manager's one link to a cycle (CR.3.2): copy it
// to send by hand, cancel it, or replace it with a new one. A link is the whole
// credential of someone outside the company, so cancelling and replacing are
// recorded with who did it (spec, "Commands"); copying only records when, so
// the overview can say whether it has gone out. Nothing here contacts the
// skip-manager: the owner sends the link themselves.

export type SkipLinkResult = { ok: true; at: string } | { ok: false; error: string };

type Actor = { personId: string; email: string; ownTeamMemberIds: readonly string[] };

type LinkCycle = { id: string; closed_at: string | null; skip_manager_person_id: string | null; skip_manager_token: string | null; skip_manager_link_cancelled_at: string | null };

async function linkCycle(cycleId: string): Promise<LinkCycle | null> {
  if (!isUuid(cycleId)) return null;
  return (
    (mustRows(
      await companyOs
        .from("review_cycles")
        .select("id, closed_at, skip_manager_person_id, skip_manager_token, skip_manager_link_cancelled_at")
        .eq("id", cycleId)
        .limit(1),
      "[org/client-reviews] review_cycles",
    )[0] as LinkCycle | undefined) ?? null
  );
}

/**
 * Why the owner may not act on the link now, or null when they may. Someone
 * reviewed in the cycle may not: the link reaches their own review, so a
 * colleague looks after it, as with every action on one's own review (the
 * boundary review on PR 2606). The overview also hides the controls from them.
 */
async function refusal(cycle: LinkCycle | null, by: Actor): Promise<string | null> {
  if (!cycle) return "That cycle was not found.";
  if (cycle.closed_at) return "This cycle is closed, so its links no longer open.";
  if (!cycle.skip_manager_person_id) return "This cycle has no skip-manager.";
  if (by.ownTeamMemberIds.length > 0) {
    const own = mustRows(
      await companyOs
        .from("review_cycle_members")
        .select("team_member_id")
        .eq("cycle_id", cycle.id)
        .in("team_member_id", [...by.ownTeamMemberIds])
        .is("withdrawn_at", null)
        .limit(1),
      "[org/client-reviews] review_cycle_members",
    );
    if (own.length > 0) return "You are reviewed in this cycle, so a colleague looks after the skip-manager's link.";
  }
  return null;
}

/**
 * Records that the owner copied the skip-manager's link. The write lands only
 * while the link is the one the page showed and still live, so a copy of a
 * link replaced in another tab is not recorded against the new one.
 */
export async function markSkipManagerLinkCopied(cycleId: string, by: Actor): Promise<SkipLinkResult> {
  const cycle = await linkCycle(cycleId);
  const refused = await refusal(cycle, by);
  if (refused) return { ok: false, error: refused };
  if (!cycle!.skip_manager_token || cycle!.skip_manager_link_cancelled_at) return { ok: false, error: "This link is cancelled. Issue a new one first." };
  const at = new Date().toISOString();
  const { data, error } = await companyOs
    .from("review_cycles")
    .update({ skip_manager_link_copied_at: at })
    .eq("id", cycleId)
    .eq("skip_manager_token", cycle!.skip_manager_token)
    .is("skip_manager_link_cancelled_at", null)
    .select("id");
  if (error) return { ok: false, error: "The link was copied, but the time could not be saved." };
  if (!data?.length) return { ok: false, error: "The link was copied, but it changed just now. Reload to see it." };
  return { ok: true, at };
}

/** Stops the skip-manager's link working. Their notes and marks so far stay. */
export async function cancelSkipManagerLink(cycleId: string, by: Actor): Promise<SkipLinkResult> {
  const cycle = await linkCycle(cycleId);
  const refused = await refusal(cycle, by);
  if (refused) return { ok: false, error: refused };
  if (cycle!.skip_manager_link_cancelled_at) return { ok: false, error: "This link is already cancelled." };
  const at = new Date().toISOString();
  const { data, error } = await companyOs
    .from("review_cycles")
    .update({ skip_manager_link_cancelled_at: at })
    .eq("id", cycleId)
    .is("skip_manager_link_cancelled_at", null)
    .select("id");
  if (error) return { ok: false, error: "The link could not be cancelled." };
  if (!data?.length) return { ok: false, error: "This link is already cancelled." };
  await audit(cycleId, by, { action: "skip_manager_link_cancelled" });
  return { ok: true, at };
}

/**
 * Replaces the skip-manager's link with a new one: the old one stops working
 * at once, a cancelled link works again under the new token, and the new link
 * is marked not yet copied. Their notes and marks so far stay.
 */
export async function reissueSkipManagerLink(cycleId: string, by: Actor): Promise<SkipLinkResult> {
  const cycle = await linkCycle(cycleId);
  const refused = await refusal(cycle, by);
  if (refused) return { ok: false, error: refused };
  const at = new Date().toISOString();
  const { data, error } = await companyOs
    .from("review_cycles")
    .update({ skip_manager_token: newLinkToken(), skip_manager_link_cancelled_at: null, skip_manager_link_copied_at: null })
    .eq("id", cycleId)
    .is("closed_at", null)
    .select("id");
  if (error) return { ok: false, error: "A new link could not be issued." };
  if (!data?.length) return { ok: false, error: "This cycle is closed, so its links no longer open." };
  await audit(cycleId, by, { action: "skip_manager_link_reissued", wasCancelled: cycle!.skip_manager_link_cancelled_at !== null });
  return { ok: true, at };
}

async function audit(cycleId: string, by: Actor, context: Record<string, Json>) {
  await recordAudit({ table: "review_cycles", recordId: cycleId, operation: "update", actor: by.email, context: { ...context, byPersonId: by.personId } });
}
