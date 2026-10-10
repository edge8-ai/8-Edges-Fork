// The inbox's subscribers (S.3): each turns one catalogue fact into at most one
// row, for the person it matters to.
//
// Recipients come from the payload, or from kernel tables when the payload
// names something the kernel can resolve (a team member's person, a company's
// owner). This entity requires nothing, so it never asks another entity; what
// it cannot resolve it does not write. A failed read raises, and the bus logs
// and audits it without the publisher ever knowing (ADR 0003), which is the
// right place for it: a missed notification is visible there, not silent here.
//
// Nothing here pushes anywhere. The inbox is a page a person chooses to open.
//
// A notification is never a side door (ADR 0013). Each kind carries the link
// it leads to on each surface, and that page already declares its permission,
// so a kind names none of its own: the recipient's access is resolved once per
// draft and each link they may not open is dropped. A draft left with no link
// the recipient may open is not written at all, which is also the answer for a
// draft with no link: closed by default, nobody vouched for what it shows.
import { companyOs } from "@/kernel/data/supabase";
import { ReadFailure } from "@/kernel/data/read";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import type { EventPayload } from "@/kernel/events";
import { cardDraft, claimDecidedDraft, claimPaidDraft, dealDraft, hireDraft, ideaBuiltDraft, ideaPickedUpDraft, ideaShippedDraft,
  kudosDraft, invoiceDraft, leaveDraft, leaveWithdrawnDraft, subtaskDraft, type Draft } from "./kinds";

async function personOfTeamMember(teamMemberId: string): Promise<string | null> {
  const { data, error } = await companyOs.from("team_members").select("person_id").eq("id", teamMemberId).maybeSingle();
  if (error) throw new ReadFailure("[notifications] team_members", error.message);
  return data?.person_id ?? null;
}

async function ownerOfCompany(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const { data, error } = await companyOs.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (error) throw new ReadFailure("[notifications] companies", error.message);
  return data?.owner_id ?? null;
}

/**
 * Writes a draft unless its person muted that kind or may open none of the
 * pages it links to; a link they may not open is left off the row. The row is
 * keyed on person, kind and event, so a fact announced twice (a retried move, a
 * mirror pass that runs again) lands once. Muting is read first because it is
 * one read, and a muted kind needs no access resolved.
 */
export async function deliver(draft: Draft | null): Promise<void> {
  if (!draft) return;
  const pref = await companyOs
    .from("notification_prefs")
    .select("muted")
    .eq("person_id", draft.personId)
    .eq("kind", draft.kind)
    .maybeSingle();
  if (pref.error) throw new ReadFailure("[notifications] notification_prefs", pref.error.message);
  if (pref.data?.muted) return;
  const mayOpen = await recipientMayOpen(draft.personId);
  const adminHref = mayOpen(draft.adminHref) ? draft.adminHref : null;
  const teamHref = mayOpen(draft.teamHref) ? draft.teamHref : null;
  if (!adminHref && !teamHref) return;
  const { error } = await companyOs.from("notifications").upsert(
    {
      person_id: draft.personId,
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      admin_href: adminHref,
      team_href: teamHref,
      event_key: draft.eventKey,
    },
    { onConflict: "person_id,kind,event_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`[notifications] notifications: ${error.message}`);
}

export async function onCardCompleted(e: EventPayload<"board.card.completed">): Promise<void> {
  await deliver(cardDraft("card.completed", e));
}

// Every landing is announced; only one into Not Doing is news to the owner.
// A landing in Done is already told by board.card.completed.
export async function onCardLanded(e: EventPayload<"board.card.landed">): Promise<void> {
  if (e.status !== "not_doing") return;
  await deliver(cardDraft("card.set_aside", e));
}

export async function onSubtaskToggled(e: EventPayload<"board.subtask.toggled">): Promise<void> {
  await deliver(subtaskDraft(e));
}

export async function onLeaveApproved(e: EventPayload<"leave.approved">): Promise<void> {
  await deliver(leaveDraft(e, await personOfTeamMember(e.teamMemberId)));
}

export async function onLeaveWithdrawn(e: EventPayload<"leave.withdrawn">): Promise<void> {
  await deliver(leaveWithdrawnDraft(e, await personOfTeamMember(e.teamMemberId)));
}

export async function onCandidateHired(e: EventPayload<"candidate.hired">): Promise<void> {
  await deliver(hireDraft(e));
}

export async function onDealWon(e: EventPayload<"deal.won">): Promise<void> {
  // The company's owner is only read when the deal names no owner of its own.
  await deliver(dealDraft(e, e.ownerId ? null : await ownerOfCompany(e.companyId)));
}

export async function onInvoicePaid(e: EventPayload<"invoice.paid">): Promise<void> {
  await deliver(invoiceDraft(e, await ownerOfCompany(e.companyId)));
}

// The claim's owner is in the payload, so nothing is read before the draft.
export async function onClaimDecided(e: EventPayload<"claim.decided">): Promise<void> {
  await deliver(claimDecidedDraft(e));
}

export async function onClaimPaid(e: EventPayload<"claim.paid">): Promise<void> {
  await deliver(claimPaidDraft(e));
}

export async function onIdeaBuilt(e: EventPayload<"idea.built">): Promise<void> {
  await deliver(ideaBuiltDraft(e));
}

export async function onIdeaPickedUp(e: EventPayload<"idea.picked_up">): Promise<void> {
  await deliver(ideaPickedUpDraft(e));
}

export async function onIdeaShipped(e: EventPayload<"idea.shipped">): Promise<void> {
  await deliver(ideaShippedDraft(e));
}

export async function onKudosGiven(e: EventPayload<"kudos.given">): Promise<void> {
  await deliver(kudosDraft(e));
}
