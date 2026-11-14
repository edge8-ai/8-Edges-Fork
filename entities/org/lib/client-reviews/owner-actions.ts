import { companyOs, type Json } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { isUuid } from "@/kernel/config/slug";
import { recordAudit } from "@/kernel/audit/audit";
import { linkedPersonIdsAt } from "@/entities/contacts";
import type { RaterKind } from "../reviews-labels";
import { factsFrom, PART_COLUMNS, type ClientPartRow, type CycleMemberRow, type CycleRow } from "./access";
import { newLinkToken, openClientReviewCycle } from "./open-cycle";
import { allowedAfterClose, canOwnerDo, type OwnerAction, type OwnerRefusal } from "./owner-rules";
import type { ClientReviewFacts } from "./rules";

// What the person running a client review does to it from the overview
// (CR.2.4, stories 4, 14, 20 to 22, 54). Each command reads the cycle, the
// member and their parts, asks ./owner-rules whether the action may be taken,
// writes one change, and leaves an audit record naming who did it. None reads
// a session: the caller's server action guards with the reviews permission
// and hands in the person acting.
//
// No row is deleted. A member taken out is withdrawn and keeps their rows; a
// link replaced is a new token on the same part, which is what makes the old
// one stop matching at once; a part reopened keeps its answers. The one thing
// cleared is a part handed to a new client manager: the previous manager's
// answers on it are theirs, so they go, and the audit record says so. The audit
// record never carries a token or an answer: audit_log is readable by the
// assistants.
//
// Nobody acts on their own review: a review admin who is in the cycle is
// refused here, not only by the page hiding the controls. And a client
// manager is always one of the cycle's client's own current contacts.

/**
 * Who is acting: their person, for the columns that name them, their address,
 * for the audit log, and their team member id, so they are refused their own
 * review (null for someone who is not a team member).
 */
/** Who is acting. `ownTeamMemberIds`: every team-member row of the person (./access, teamMemberIdsOf), never one's own review to act on. */
export type Actor = { personId: string; email: string; ownTeamMemberIds: readonly string[] };

/** A part the owner can reopen: the member's own, or the client manager's. */
type ReopenablePart = Extract<RaterKind, "self" | "client_manager">;

const OWN_REVIEW = "This is your own review, so a colleague acts on it.";
const NOT_FOUND = "That review was not found.";
const CHANGED = "That part changed just now. Reload and try again.";

const REFUSED: Record<OwnerRefusal, string> = {
  cycle_closed: "This cycle is closed.",
  member_withdrawn: "This member was withdrawn from the cycle.",
  released: "This review is released, so it stays as it was.",
  no_client_manager: "This member has no client manager.",
  already_unlocked: "The client manager's part is already unlocked.",
  member_submitted: "The member has already sent their part, so the client manager's part is open.",
  not_submitted: "That part has not been sent, so it is already open.",
  client_manager_submitted: "The client manager has already sent their part. Reopen it first if it must be redone.",
  no_skip_manager: "This cycle has no skip-manager, so there is no mark to waive.",
  already_waived: "The skip-manager's mark is already waived for this member.",
  skip_manager_reviewed: "The skip-manager has already marked this member Reviewed.",
  client_manager_not_submitted: "The client manager has not sent their part yet.",
  member_part_reopened: "The member's part is reopened and not sent again yet.",
  skip_manager_not_reviewed: "The skip-manager has not marked this member Reviewed. Waive the mark if the review should not wait.",
};

type OwnerCycle = CycleRow & { company_id: string | null; opened_by: string };
type OwnerMember = CycleMemberRow & { team_member_id: string; client_manager_person_id: string | null };

/** One member's review as a command finds it, with the rules' facts. */
type OpenReview = { cycle: OwnerCycle; member: OwnerMember; parts: { member: ClientPartRow | null; clientManager: ClientPartRow | null }; facts: ClientReviewFacts };

async function cycleOf(cycleId: string): Promise<OwnerCycle | null> {
  if (!isUuid(cycleId)) return null;
  return (
    (mustRows(
      await companyOs
        .from("review_cycles")
        .select("id, name, closed_at, company_id, framework_id, opened_by, skip_manager_person_id, skip_manager_link_cancelled_at")
        .eq("id", cycleId)
        .limit(1),
      "[org/client-reviews] review_cycles",
    )[0] as OwnerCycle | undefined) ?? null
  );
}

async function memberOf(cycleId: string, teamMemberId: string): Promise<OwnerMember | null> {
  if (!isUuid(teamMemberId)) return null;
  return (
    (mustRows(
      await companyOs
        .from("review_cycle_members")
        .select("team_member_id, client_manager_person_id, withdrawn_at, rater_unlocked_at, skip_waived_at, released_at")
        .eq("cycle_id", cycleId)
        .eq("team_member_id", teamMemberId)
        .limit(1),
      "[org/client-reviews] review_cycle_members",
    )[0] as OwnerMember | undefined) ?? null
  );
}

async function partsOf(cycleId: string, teamMemberId: string): Promise<ClientPartRow[]> {
  return mustRows(
    await companyOs
      .from("performance_reviews")
      // Filtered by the cycle, never selecting it: the public fork's schema
      // dump has no review_cycle_id to select until it is regenerated.
      .select(PART_COLUMNS)
      .eq("review_cycle_id", cycleId)
      .eq("team_member_id", teamMemberId)
      .eq("review_type", "client"),
    "[org/client-reviews] performance_reviews",
  ) as ClientPartRow[];
}

/**
 * The member's review, read for one action and refused when the rules refuse
 * that action, when the cycle or the member is missing, or when the member is
 * the person acting. A closed cycle is refused before the member is read,
 * except for the actions the owner still takes after closing (the summary,
 * a waiver, the release: ./owner-rules, allowedAfterClose).
 */
export async function reviewFor(cycleId: string, teamMemberId: string, by: Actor, action: OwnerAction): Promise<({ ok: true } & OpenReview) | { ok: false; error: string }> {
  if (by.ownTeamMemberIds.includes(teamMemberId)) return { ok: false, error: OWN_REVIEW };
  const cycle = await cycleOf(cycleId);
  if (!cycle) return { ok: false, error: NOT_FOUND };
  if (cycle.closed_at && !allowedAfterClose(action)) return { ok: false, error: REFUSED.cycle_closed };
  const member = await memberOf(cycle.id, teamMemberId);
  if (!member) return { ok: false, error: NOT_FOUND };
  const { facts, parts } = factsFrom(cycle, member, await partsOf(cycle.id, teamMemberId));
  const may = canOwnerDo(facts, action);
  if (!may.ok) return { ok: false, error: REFUSED[may.reason] };
  return { ok: true, cycle, member, parts, facts };
}

/** Whether a person is one of the client's current contacts: only they may be a member's client manager. An archived contact is not. */
async function isContactOf(companyId: string | null, personId: string): Promise<boolean> {
  if (!companyId || !isUuid(personId)) return false;
  const linked = mustRows(await linkedPersonIdsAt(companyId, [personId]), "[org/client-reviews] person_companies");
  if (linked.length === 0) return false;
  const current = mustRows(await companyOs.from("people").select("id").eq("id", personId).is("archived_at", null).limit(1), "[org/client-reviews] people");
  return current.length > 0;
}

/** Whether a part holds any answer: a rating, a text column, or a metadata key the forms write. */
function holdsAnswers(part: ClientPartRow): boolean {
  const bookkeeping = new Set(["survey_slug", "link_copied_at", "link_cancelled_at", "link_reissued_at", "reopened_at", "reopened_by", "previously_sent_at"]);
  return (
    Object.keys(part.ratings ?? {}).length > 0 ||
    [part.achievements, part.improvements, part.comments].some((t) => typeof t === "string" && t !== "") ||
    Object.keys(part.metadata ?? {}).some((k) => !bookkeeping.has(k))
  );
}

/** Adds one member to the cycle the way opening wrote everyone, by opening the same cycle again with them. */
async function openFor(cycle: OwnerCycle, teamMemberId: string, clientManagerPersonId: string | null): Promise<Result> {
  const added = await openClientReviewCycle({
    companyId: cycle.company_id,
    frameworkId: cycle.framework_id,
    name: cycle.name,
    openedByPersonId: cycle.opened_by,
    skipManagerPersonId: cycle.skip_manager_person_id,
    members: [{ teamMemberId, clientManagerPersonId }],
  });
  return added.ok ? { ok: true } : added;
}

export async function audit(table: string, recordId: string, by: Actor, context: Record<string, Json>) {
  await recordAudit({ table, recordId, operation: "update", actor: by.email, context: { ...context, byPersonId: by.personId } });
}

/** Lets the client manager fill their part before the member has sent theirs (story 22). */
export async function unlockClientManagerPart(cycleId: string, teamMemberId: string, by: Actor): Promise<Result> {
  const review = await reviewFor(cycleId, teamMemberId, by, "unlock");
  if (!review.ok) return review;
  const { data, error } = await companyOs
    .from("review_cycle_members")
    .update({ rater_unlocked_at: new Date().toISOString(), rater_unlocked_by: by.personId })
    .eq("cycle_id", review.cycle.id)
    .eq("team_member_id", teamMemberId)
    .is("rater_unlocked_at", null)
    .select("team_member_id");
  if (error) return { ok: false, error: "Could not unlock the part." };
  if (!data?.length) return { ok: false, error: REFUSED.already_unlocked };
  await audit("review_cycle_members", review.cycle.id, by, { action: "client_review.unlock", teamMemberId });
  return { ok: true };
}

/**
 * Puts one sent part back to open, with its answers kept, so the person who
 * wrote it can correct a genuine mistake (story 54). The reopening and the
 * time it was first sent are written on the part, and the audit log records
 * it. The confirmations are asked again when it is resent, and the resend is
 * its new submission time (../reviews/run.ts).
 */
export async function reopenClientPart(cycleId: string, teamMemberId: string, kind: ReopenablePart, by: Actor): Promise<Result> {
  const review = await reviewFor(cycleId, teamMemberId, by, kind === "self" ? "reopen_member" : "reopen_client_manager");
  if (!review.ok) return review;
  const part = kind === "self" ? review.parts.member : review.parts.clientManager;
  if (!part) return { ok: false, error: NOT_FOUND };
  const earlier = part.metadata?.previously_sent_at;
  const metadata = {
    ...(part.metadata ?? {}),
    reopened_at: new Date().toISOString(),
    reopened_by: by.personId,
    // The first send's time stays on the part when the resend replaces it.
    previously_sent_at: typeof earlier === "string" ? earlier : part.submitted_at,
  };
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({ status: "open", metadata: metadata as Json })
    .eq("id", part.id)
    .eq("status", part.status)
    .select("id");
  if (error) return { ok: false, error: "Could not reopen the part." };
  if (!data?.length) return { ok: false, error: CHANGED };
  await audit("performance_reviews", part.id, by, { action: "client_review.reopen", raterKind: part.rater_kind });
  return { ok: true };
}

/**
 * Replaces a client manager's link with a new one (story 20). The old token
 * stops matching the moment this is written; the copied time is cleared, so
 * the overview shows the new link as not yet sent.
 */
export async function reissueClientManagerLink(cycleId: string, teamMemberId: string, by: Actor): Promise<Result> {
  const review = await reviewFor(cycleId, teamMemberId, by, "new_link");
  if (!review.ok) return review;
  const part = review.parts.clientManager;
  if (!part) return { ok: false, error: REFUSED.no_client_manager };
  // The copied time and any cancellation belong to the old link, so they go with it.
  const kept = Object.fromEntries(Object.entries(part.metadata ?? {}).filter(([key]) => key !== "link_copied_at" && key !== "link_cancelled_at"));
  const { data, error } = await companyOs
    .from("performance_reviews")
    .update({ access_token: newLinkToken(), metadata: { ...kept, link_reissued_at: new Date().toISOString() } as Json })
    .eq("id", part.id)
    // The metadata holds the client manager's answers, so a submission that
    // lands in between makes this miss rather than be written over.
    .eq("status", part.status)
    .select("id");
  if (error) return { ok: false, error: "Could not issue a new link." };
  if (!data?.length) return { ok: false, error: CHANGED };
  await audit("performance_reviews", part.id, by, { action: "client_review.link_reissued" });
  return { ok: true };
}

/**
 * Names a different client manager for one member (story 21). The part goes
 * to them blank, under a new link: the old link stops at once, and nothing the
 * previous manager wrote, even in a part the owner reopened, is shown to the
 * new one or sent under their name. A part already sent is not handed over:
 * the owner reopens it first. The part changes before the member row, so a
 * failure leaves the old manager's link stopped rather than still working.
 */
export async function changeClientManager(cycleId: string, teamMemberId: string, clientManagerPersonId: string, by: Actor): Promise<Result> {
  if (!isUuid(clientManagerPersonId)) return { ok: false, error: "Choose a client manager." };
  const review = await reviewFor(cycleId, teamMemberId, by, "change_client_manager");
  if (!review.ok) return review;
  if (review.member.client_manager_person_id === clientManagerPersonId) return { ok: false, error: "That is already their client manager." };
  if (!(await isContactOf(review.cycle.company_id, clientManagerPersonId))) return { ok: false, error: "Choose one of the client's contacts." };
  const part = review.parts.clientManager;
  if (part) {
    const surveySlug = part.metadata?.survey_slug;
    const { data, error } = await companyOs
      .from("performance_reviews")
      .update({
        access_token: newLinkToken(),
        ratings: {},
        achievements: null,
        improvements: null,
        comments: null,
        // Only the form's own key survives; the answers, the reopening and the
        // old link's copied time all belonged to the previous manager.
        metadata: { ...(typeof surveySlug === "string" ? { survey_slug: surveySlug } : {}), link_reissued_at: new Date().toISOString() } as Json,
      })
      .eq("id", part.id)
      .eq("status", part.status)
      .select("id");
    if (error) return { ok: false, error: "Could not change the client manager." };
    if (!data?.length) return { ok: false, error: CHANGED };
  }
  const { error } = await companyOs
    .from("review_cycle_members")
    .update({ client_manager_person_id: clientManagerPersonId })
    .eq("cycle_id", review.cycle.id)
    .eq("team_member_id", teamMemberId);
  if (error) return { ok: false, error: "The old link was stopped, but the new client manager could not be saved. Try again." };
  // A member who had no client manager gets their part now.
  if (!part) {
    const added = await openFor(review.cycle, teamMemberId, clientManagerPersonId);
    if (!added.ok) return added;
  }
  await audit("review_cycle_members", review.cycle.id, by, {
    action: "client_review.client_manager_changed",
    teamMemberId,
    // Whether the previous manager's answers were on the part handed over, and so were cleared.
    answersCleared: part !== null && holdsAnswers(part),
  });
  return { ok: true };
}

/** Adds someone to an open cycle, through the same command that opened it (story 4). They are told, as opening tells everyone. */
export async function addCycleMember(cycleId: string, teamMemberId: string, clientManagerPersonId: string | null, by: Actor): Promise<Result> {
  if (!isUuid(teamMemberId)) return { ok: false, error: "Choose someone to add." };
  if (by.ownTeamMemberIds.includes(teamMemberId)) return { ok: false, error: OWN_REVIEW };
  const cycle = await cycleOf(cycleId);
  if (!cycle) return { ok: false, error: NOT_FOUND };
  if (cycle.closed_at) return { ok: false, error: REFUSED.cycle_closed };
  if (clientManagerPersonId !== null && !(await isContactOf(cycle.company_id, clientManagerPersonId))) return { ok: false, error: "Choose one of the client's contacts." };
  // Opening again would quietly skip someone already in the cycle; saying so is kinder.
  const already = await memberOf(cycle.id, teamMemberId);
  if (already) return { ok: false, error: already.withdrawn_at ? "They were withdrawn from this cycle." : "They are already in this cycle." };
  const added = await openFor(cycle, teamMemberId, clientManagerPersonId);
  if (!added.ok) return added;
  await audit("review_cycle_members", cycle.id, by, { action: "client_review.member_added", teamMemberId });
  return { ok: true };
}

/** Takes someone out of a cycle (story 4). Their rows stay; they leave the counts, their links stop, and only review admins still see their review. */
export async function withdrawCycleMember(cycleId: string, teamMemberId: string, by: Actor): Promise<Result> {
  const review = await reviewFor(cycleId, teamMemberId, by, "withdraw");
  if (!review.ok) return review;
  const { data, error } = await companyOs
    .from("review_cycle_members")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("cycle_id", review.cycle.id)
    .eq("team_member_id", teamMemberId)
    .is("withdrawn_at", null)
    .select("team_member_id");
  if (error) return { ok: false, error: "Could not withdraw them." };
  if (!data?.length) return { ok: false, error: "They were already withdrawn." };
  await audit("review_cycle_members", review.cycle.id, by, { action: "client_review.member_withdrawn", teamMemberId });
  return { ok: true };
}

/** Closes a cycle (story 14): every link in it stops. Releasing a ready review still works afterwards. */
export async function closeClientCycle(cycleId: string, by: Actor): Promise<Result> {
  const cycle = await cycleOf(cycleId);
  if (!cycle) return { ok: false, error: NOT_FOUND };
  if (cycle.closed_at) return { ok: false, error: "This cycle is already closed." };
  const { data, error } = await companyOs
    .from("review_cycles")
    .update({ closed_at: new Date().toISOString(), closed_by: by.personId })
    .eq("id", cycle.id)
    .is("closed_at", null)
    .select("id");
  if (error) return { ok: false, error: "Could not close the cycle." };
  if (!data?.length) return { ok: false, error: "This cycle is already closed." };
  await audit("review_cycles", cycle.id, by, { action: "client_review.closed" });
  return { ok: true };
}
