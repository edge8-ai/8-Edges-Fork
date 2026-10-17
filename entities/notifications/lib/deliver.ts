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
import { personIdOfTeamMember } from "@/kernel/identity/team-people";
import type { EventPayload } from "@/kernel/events";
import { ALWAYS_ON_KINDS, cardDraft, claimDecidedDraft, claimPaidDraft, dealDraft, hireDraft, ideaBuiltDraft, ideaPickedUpDraft, ideaShippedDraft,
  kudosDraft, invoiceDraft, leaveDraft, leaveWithdrawnDraft, subtaskDraft, type Draft } from "./kinds";
import { assignedDraft, commentedDraft, dueTomorrowDraft, ideaSetAsideDraft, mentionedDraft } from "./work-kinds";
import { homeworkDrafts, noteUpdatedDraft, prepReadyDraft, recapPublishedDrafts, recapReadyDraft, sessionTodayDraft, weeklyHeldDrafts, weeklyWaitingDraft } from "./training-kinds";

async function ownerOfCompany(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const { data, error } = await companyOs.from("companies").select("owner_id").eq("id", companyId).maybeSingle();
  if (error) throw new ReadFailure("[notifications] companies", error.message);
  return data?.owner_id ?? null;
}

/**
 * Whether the person still wants this row: not when they muted its kind, nor
 * when they stopped updates about its card or spark (TH.2). A direct request
 * (assigned, @mentioned) is always wanted.
 */
async function wanted(draft: Draft): Promise<boolean> {
  if (ALWAYS_ON_KINDS.includes(draft.kind)) return true;
  const pref = await companyOs
    .from("notification_prefs")
    .select("muted")
    .eq("person_id", draft.personId)
    .eq("kind", draft.kind)
    .maybeSingle();
  if (pref.error) throw new ReadFailure("[notifications] notification_prefs", pref.error.message);
  if (pref.data?.muted) return false;
  if (!draft.subject) return true;
  const mute = await companyOs
    .from("notification_mutes")
    .select("subject")
    .eq("person_id", draft.personId)
    .eq("subject", draft.subject)
    .maybeSingle();
  if (mute.error) throw new ReadFailure("[notifications] notification_mutes", mute.error.message);
  return !mute.data;
}

/**
 * Writes a draft unless its person muted that kind or may open none of the
 * pages it links to; a link they may not open is left off the row. The row is
 * keyed on person, kind and event, so a fact announced twice (a retried move, a
 * mirror pass that runs again) lands once. Muting is read first because it is
 * one read, and a muted kind needs no access resolved.
 *
 * `actorId` is the person whose action raised the fact (TH.2.8), so the row can
 * show their face. A publisher that names an id which is not a person would
 * have the whole row refused by the column's reference; the row is the point
 * and the face is not, so it is written again without one.
 */
export async function deliver(draft: Draft | null, actorId: string | null = null): Promise<void> {
  if (!draft) return;
  if (!(await wanted(draft))) return;
  const mayOpen = await recipientMayOpen(draft.personId);
  const adminHref = mayOpen(draft.adminHref) ? draft.adminHref : null;
  const teamHref = mayOpen(draft.teamHref) ? draft.teamHref : null;
  if (!adminHref && !teamHref) return;
  const row = {
    person_id: draft.personId,
    kind: draft.kind,
    title: draft.title,
    body: draft.body,
    admin_href: adminHref,
    team_href: teamHref,
    event_key: draft.eventKey,
    subject: draft.subject ?? null,
    actor_id: actorId,
  };
  const write = (r: typeof row) => companyOs.from("notifications").upsert(r, { onConflict: "person_id,kind,event_key", ignoreDuplicates: true });
  let { error } = await write(row);
  if (error?.code === "23503" && actorId) {
    console.error(`[notifications] actor ${actorId} is not a person; ${draft.kind} written without a face`);
    ({ error } = await write({ ...row, actor_id: null }));
  }
  if (error) throw new Error(`[notifications] notifications: ${error.message}`);
}

export async function onCardCompleted(e: EventPayload<"board.card.completed">): Promise<void> {
  await deliver(cardDraft("card.completed", e), e.actorPersonId);
}

// Every landing is announced; only one into Not Doing is news to the owner.
// A landing in Done is already told by board.card.completed.
export async function onCardLanded(e: EventPayload<"board.card.landed">): Promise<void> {
  if (e.status !== "not_doing") return;
  await deliver(cardDraft("card.set_aside", e), e.actorPersonId);
}

export async function onSubtaskToggled(e: EventPayload<"board.subtask.toggled">): Promise<void> {
  await deliver(subtaskDraft(e), e.actorPersonId);
}

export async function onLeaveApproved(e: EventPayload<"leave.approved">): Promise<void> {
  await deliver(leaveDraft(e, await personIdOfTeamMember(e.teamMemberId)), e.actorPersonId);
}

export async function onLeaveWithdrawn(e: EventPayload<"leave.withdrawn">): Promise<void> {
  await deliver(leaveWithdrawnDraft(e, await personIdOfTeamMember(e.teamMemberId)), e.actorPersonId);
}

export async function onCandidateHired(e: EventPayload<"candidate.hired">): Promise<void> {
  await deliver(hireDraft(e), e.actorPersonId);
}

export async function onDealWon(e: EventPayload<"deal.won">): Promise<void> {
  // The company's owner is only read when the deal names no owner of its own.
  await deliver(dealDraft(e, e.ownerId ? null : await ownerOfCompany(e.companyId)), e.actorPersonId);
}

export async function onInvoicePaid(e: EventPayload<"invoice.paid">): Promise<void> {
  await deliver(invoiceDraft(e, await ownerOfCompany(e.companyId)));
}

// The claim's owner is in the payload, so nothing is read before the draft.
// A claim's decision is Finance's, not one person's news, so its row keeps the
// kind's icon rather than the approver's face (TH.2.8, as the canvas drew it).
export async function onClaimDecided(e: EventPayload<"claim.decided">): Promise<void> {
  await deliver(claimDecidedDraft(e));
}

export async function onClaimPaid(e: EventPayload<"claim.paid">): Promise<void> {
  await deliver(claimPaidDraft(e));
}

export async function onIdeaBuilt(e: EventPayload<"idea.built">): Promise<void> {
  await deliver(ideaBuiltDraft(e), e.actorPersonId);
}

export async function onIdeaPickedUp(e: EventPayload<"idea.picked_up">): Promise<void> {
  await deliver(ideaPickedUpDraft(e), e.actorPersonId);
}

export async function onIdeaShipped(e: EventPayload<"idea.shipped">): Promise<void> {
  await deliver(ideaShippedDraft(e), e.actorPersonId);
}

export async function onKudosGiven(e: EventPayload<"kudos.given">): Promise<void> {
  await deliver(kudosDraft(e), e.actorPersonId);
}

// TH.2: the work facts. Due tomorrow is the morning routine's, so no face.
export async function onCardAssigned(e: EventPayload<"board.card.assigned">): Promise<void> {
  await deliver(assignedDraft(e), e.actorPersonId);
}

export async function onCardMentioned(e: EventPayload<"board.card.mentioned">): Promise<void> {
  await deliver(mentionedDraft(e), e.actorPersonId);
}

export async function onCardCommented(e: EventPayload<"board.card.commented">): Promise<void> {
  await deliver(commentedDraft(e), e.actorPersonId);
}

export async function onCardDueTomorrow(e: EventPayload<"board.card.due_tomorrow">): Promise<void> {
  await deliver(dueTomorrowDraft(e));
}

export async function onIdeaSetAside(e: EventPayload<"idea.set_aside">): Promise<void> {
  await deliver(ideaSetAsideDraft(e), e.actorPersonId);
}

export async function onTrainingPrepDrafted(e: EventPayload<"training.prep.drafted">): Promise<void> {
  await deliver(prepReadyDraft(e));
}

export async function onTrainingSessionToday(e: EventPayload<"training.session.today">): Promise<void> {
  await deliver(sessionTodayDraft(e));
}

export async function onTrainingHomeworkSet(e: EventPayload<"training.homework.set">): Promise<void> {
  for (const draft of homeworkDrafts(e)) await deliver(draft);
}

export async function onTrainingNoteUpdated(e: EventPayload<"training.note.updated">): Promise<void> {
  await deliver(noteUpdatedDraft(e), e.actorPersonId);
}

export async function onTrainingRecapDrafted(e: EventPayload<"training.recap.drafted">): Promise<void> {
  await deliver(recapReadyDraft(e));
}

export async function onTrainingRecapPublished(e: EventPayload<"training.recap.published">): Promise<void> {
  for (const draft of recapPublishedDrafts(e)) await deliver(draft, e.actorPersonId);
}

export async function onTrainingWeeklyRecapWaiting(e: EventPayload<"training.weekly_recap.waiting">): Promise<void> {
  await deliver(weeklyWaitingDraft(e));
}

/** A held recap: the plan's recipients the organiser named, each dropped by deliver when they cannot open the team hub. */
export async function onTrainingWeeklyRecapHeld(e: EventPayload<"training.weekly_recap.held">): Promise<void> {
  for (const draft of weeklyHeldDrafts(e, e.recipientPersonIds)) await deliver(draft, e.organiserId);
}
