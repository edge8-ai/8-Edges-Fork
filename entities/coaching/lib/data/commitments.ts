import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { one } from "@/kernel/config/embedded";
import { selectTasks, selectBoardMembers, selectBoardColumns, insertTasks, SUBJECT_COMMITMENT } from "@/entities/boards";
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

// Push a commitment onto a task board as a linked card. Idempotent: if a live
// card already links to this commitment, do nothing. Assignee is the coached
// person for a member commitment, the coach for a coach commitment.
export async function coachPushCommitmentToBoard(
  actor: TeamActor,
  commitmentId: string,
  boardId: string,
): Promise<Result & { created?: { assigneeId: string | null; title: string } }> {
  const row = await assertCoachOwnsCommitment(actor, commitmentId);
  if (!row) return { ok: false, error: "Not found." };
  if (!boardId) return { ok: false, error: "Pick a board." };
  // The board is the write boundary: only a member (or admin) may add a card,
  // exactly as every admin/team board mutation enforces. The actor is already
  // resolved here, so check membership directly (no session helper — this module
  // is reachable from client components and must not import next/headers).
  if (!actor.isAdmin) {
    const { data: mem, error: memError } = await selectBoardMembers("id")
      .eq("board_id", boardId)
      .eq("person_id", actor.personId)
      .maybeSingle();
    if (memError) console.error("[team/coaching/commitments] board_members", memError);
    if (!mem) return { ok: false, error: "You are not a member of that board." };
  }

  const { data: existing, error: existingError } = await selectTasks("id")
    .eq("subject_type", SUBJECT_COMMITMENT)
    .eq("subject_id", commitmentId)
    .is("archived_at", null)
    .maybeSingle();
  if (existingError) console.error("[team/coaching/commitments] tasks", existingError);
  if (existing) return { ok: true };

  const { data: cols, error: colsError } = await selectBoardColumns("id, is_done, position")
    .eq("board_id", boardId)
    .order("position");
  if (colsError) console.error("[team/coaching/commitments] board_columns", colsError);
  const columns = (cols ?? []) as { id: string; is_done: boolean; position: number }[];
  if (columns.length === 0) return { ok: false, error: "That board has no columns." };
  const target = columns.find((c) => !c.is_done) ?? columns[0];

  const owner = row.owner as CommitmentOwner;
  const { data: prof, error: profError } = await companyOs
    .from("coaching_profiles")
    .select("team_member_id, coach_id")
    .eq("id", row.coaching_profile_id as string)
    .maybeSingle();
  if (profError) console.error("[team/coaching/commitments] coaching_profiles", profError);
  const p = prof as { team_member_id: string; coach_id: string } | null;
  const targetTm = owner === "coach" ? p?.coach_id : p?.team_member_id;
  let assigneeId: string | null = null;
  if (targetTm) {
    const { data: tm, error: tmError } = await companyOs.from("team_members").select("person_id").eq("id", targetTm).maybeSingle();
    if (tmError) console.error("[team/coaching/commitments] team_members", tmError);
    assigneeId = (tm as { person_id: string } | null)?.person_id ?? null;
  }

  const { data: last, error: lastError } = await selectTasks("position")
    .eq("board_id", boardId)
    .eq("board_column_id", target.id)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) console.error("[team/coaching/commitments] tasks", lastError);
  const position = ((last as { position: number } | null)?.position ?? 0) + 1;

  const { error } = await insertTasks({
    board_id: boardId,
    board_column_id: target.id,
    title: row.title as string,
    assignee_id: assigneeId,
    due_date: (row.due_on as string | null) ?? null,
    priority: "p2",
    status: "open",
    subject_type: SUBJECT_COMMITMENT,
    subject_id: commitmentId,
    position,
  });
  if (error) return { ok: false, error: "Could not add the card." };
  return { ok: true, created: { assigneeId, title: row.title as string } };
}
