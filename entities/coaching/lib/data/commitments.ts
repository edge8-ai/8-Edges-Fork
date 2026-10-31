import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { pushCommitmentCard, type PushedCard } from "./commitment-card";
import { COMMITMENT_STATUS_LABELS, type CommitmentOwner, type CommitmentStatus } from "../types";
import { COMMITMENT_SELECT } from "./rows";
import { reassign } from "../stack-order";
import { normalisePlan } from "../commitment-plan";
import { assertCoachOwnsProfile, type Result } from "./shared";

// One recorded change to a commitment. A row states one kind of change: a move
// leaves the title halves undefined, a reword leaves the status halves
// undefined, so the card can tell "changed 2x" from "moved twice".
export type CommitmentChange = {
  titleBefore?: string | null;
  titleAfter?: string | null;
  statusBefore?: CommitmentStatus | null;
  statusAfter?: CommitmentStatus | null;
};

// Write the history row for a change that already landed on the commitment.
// Called by every writer that changes a title or a status, in the same call, so
// the board's current state and its history can never disagree.
//
// A failure here is logged rather than returned: the commitment update it
// describes has already been written, so failing the Result would tell the
// member their move did not happen when it did.
export async function recordCommitmentChange(
  commitmentId: string,
  changedBy: string | null,
  change: CommitmentChange,
): Promise<void> {
  const titleChanged = change.titleBefore !== undefined && change.titleBefore !== change.titleAfter;
  const statusChanged = change.statusBefore !== undefined && change.statusBefore !== change.statusAfter;
  if (!titleChanged && !statusChanged) return;
  const { error } = await companyOs.from("coaching_commitment_history").insert({
    commitment_id: commitmentId,
    changed_by: changedBy,
    title_before: titleChanged ? (change.titleBefore ?? null) : null,
    title_after: titleChanged ? (change.titleAfter ?? null) : null,
    status_before: statusChanged ? (change.statusBefore ?? null) : null,
    status_after: statusChanged ? (change.statusAfter ?? null) : null,
  });
  if (error) console.error("[team/coaching/commitments] coaching_commitment_history", error);
}

// How many changes each of these commitments has seen, for the card's
// "changed N x" line. One query for the whole board rather than one per card;
// an id with no rows is simply absent from the map.
export async function getCommitmentHistoryCounts(
  commitmentIds: string[],
): Promise<Record<string, number>> {
  if (commitmentIds.length === 0) return {};
  const { data, error } = await companyOs
    .from("coaching_commitment_history")
    .select("commitment_id")
    .in("commitment_id", commitmentIds);
  if (error) {
    console.error("[team/coaching/commitments] coaching_commitment_history counts", error);
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { commitment_id: string }[]) {
    counts[row.commitment_id] = (counts[row.commitment_id] ?? 0) + 1;
  }
  return counts;
}

export async function coachAddCommitment(
  actor: TeamActor,
  profileId: string,
  input: { title: string; owner: CommitmentOwner; dueOn: string | null; oneOnOneId?: string | null },
): Promise<Result> {
  if (!(await assertCoachOwnsProfile(actor, profileId))) return { ok: false, error: "Not found." };
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Write the commitment first." };
  if (title.length > 500) return { ok: false, error: "Keep the commitment under 500 characters." };
  if (input.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) return { ok: false, error: "Bad date." };
  const owner: CommitmentOwner = input.owner === "coach" ? "coach" : "member";
  const { error } = await companyOs.from("coaching_commitments").insert({
    coaching_profile_id: profileId,
    one_on_one_id: input.oneOnOneId ?? null,
    title,
    owner,
    due_on: input.dueOn,
    created_by: actor.teamMemberId,
    sort_order: await nextCommitmentSort(profileId),
  });
  return error ? { ok: false, error: "Could not add the commitment." } : { ok: true };
}

// New commitments land at the bottom of the stack.
export async function nextCommitmentSort(profileId: string): Promise<number> {
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select("sort_order")
    .eq("coaching_profile_id", profileId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/commitments] coaching_commitments", dataError);
  const top = (data as { sort_order: number | null } | null)?.sort_order;
  return typeof top === "number" ? top + 1 : 0;
}


// The coach's own view of the same stack (K.66). Scoped by the coach owning
// the profile each card hangs from, the way every other coach write here is.
export async function coachReorderCommitments(actor: TeamActor, orderedIds: string[]): Promise<Result> {
  const ids = orderedIds.filter(Boolean);
  if (ids.length < 2) return { ok: true };
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select("id, sort_order, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)")
    .in("id", ids);
  if (dataError) {
    console.error("[team/coaching/commitments] coaching_commitments", dataError);
    return { ok: false, error: "Could not save the order." };
  }
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (rows.length !== ids.length) return { ok: false, error: "Not found." };
  const held: { id: string; sortOrder: number }[] = [];
  for (const r of rows) {
    const prof = r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null;
    const coachId = Array.isArray(prof) ? prof[0]?.coach_id : prof?.coach_id;
    if (coachId !== actor.teamMemberId) return { ok: false, error: "Not found." };
    held.push({ id: r.id as string, sortOrder: (r.sort_order as number | null) ?? 0 });
  }
  for (const next of reassign(ids, held)) {
    const { error } = await companyOs
      .from("coaching_commitments")
      .update({ sort_order: next.sortOrder, updated_at: new Date().toISOString() })
      .eq("id", next.id);
    if (error) {
      console.error("[team/coaching/commitments] coaching_commitments sort_order", error);
      return { ok: false, error: "Could not save the order." };
    }
  }
  return { ok: true };
}

export async function assertCoachOwnsCommitment(
  actor: TeamActor,
  commitmentId: string,
): Promise<Record<string, unknown> | null> {
  if (!commitmentId) return null;
  const { data, error: dataError } = await companyOs
    .from("coaching_commitments")
    .select(`${COMMITMENT_SELECT}, coaching_profiles:coaching_profiles!coaching_profile_id(coach_id)`)
    .eq("id", commitmentId)
    .maybeSingle();
  if (dataError) console.error("[team/coaching/commitments] coaching_commitments", dataError);
  if (!data) return null;
  const r = data as unknown as Record<string, unknown>;
  const prof = one(r.coaching_profiles as { coach_id: string } | { coach_id: string }[] | null);
  return prof?.coach_id === actor.teamMemberId ? r : null;
}

export async function coachUpdateCommitment(
  actor: TeamActor,
  commitmentId: string,
  patch: { status?: CommitmentStatus; statusNote?: string; title?: string; dueOn?: string | null; plan?: string | null },
): Promise<Result> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  const update: CompanyOsUpdate<"coaching_commitments"> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "The commitment needs a title." };
    update.title = t;
  }
  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueOn)) return { ok: false, error: "Bad date." };
    update.due_on = patch.dueOn;
  }
  if (patch.status !== undefined) {
    if (!(patch.status in COMMITMENT_STATUS_LABELS)) return { ok: false, error: "Bad status." };
    update.status = patch.status;
    update.status_updated_by = actor.teamMemberId;
    update.status_updated_at = new Date().toISOString();
    update.closed_at =
      patch.status === "completed" || patch.status === "dropped" ? new Date().toISOString() : null;
  }
  if (patch.statusNote !== undefined) update.status_note = patch.statusNote.trim() || null;
  // "When will you do it?" (L.1). Not recorded in the commitment history: the
  // history exists so a reworded or moved promise cannot be quietly rewritten,
  // and a plan is the owner's own note to themselves about the same promise.
  if (patch.plan !== undefined) update.plan_md = normalisePlan(patch.plan);
  const { error } = await companyOs.from("coaching_commitments").update(update).eq("id", commitmentId);
  if (error) return { ok: false, error: "Could not update the commitment." };
  await recordCommitmentChange(commitmentId, actor.teamMemberId, {
    ...(update.title !== undefined
      ? { titleBefore: row.title as string, titleAfter: update.title }
      : {}),
    ...(update.status !== undefined
      ? { statusBefore: row.status as CommitmentStatus, statusAfter: update.status as CommitmentStatus }
      : {}),
  });
  return { ok: true };
}

// Push a commitment onto a task board as a linked card, from the coach's side:
// the coach owns the profile the promise is on, and the rest (the board, the
// duplicate check, the assignee and the birth) is pushCommitmentCard's (A.53).
// The card is the coached person's for a member commitment, the coach's for a
// coach commitment.
export async function coachPushCommitmentToBoard(actor: TeamActor, commitmentId: string, boardId: string): Promise<PushedCard> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  return pushCommitmentCard({
    side: "coach",
    actor,
    boardId,
    commitment: {
      id: commitmentId,
      title: row.title as string,
      dueOn: (row.due_on as string | null) ?? null,
      owner: row.owner as CommitmentOwner,
      profileId: row.coaching_profile_id as string,
    },
  });
}
