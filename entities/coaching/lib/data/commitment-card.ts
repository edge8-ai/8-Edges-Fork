import { companyOs } from "@/kernel/data/supabase";
import type { TeamActor } from "@/kernel/identity/team-auth";
import {
  activeBoard,
  anyLiveCardOfSubject,
  bearCard,
  firstOpenColumn,
  pickableBoards,
  setCardSprint,
  SUBJECT_COMMITMENT,
  type PickableBoard,
} from "@/entities/boards";
import type { CommitmentOwner } from "../types";
import type { Result } from "./shared";

// "Add to Workboard" for a commitment, from either side of the coaching
// relationship, written once (A.53).
//
// The coach's push (coachPushCommitmentToBoard) and the member's
// (myPushCommitmentToBoard, L.18.3) were twins that had drifted: the coach's
// logged a failed duplicate check and went on to card the promise a second
// time, both hand-rolled the column's next position, the coach's never put the
// card in the open sprint, and neither card had a create row, an audit row or
// an event. Each side keeps its own question (whose promise this is, which the
// wrappers answer), and this file answers the rest: which board, whether the
// card exists, who it is for, and the birth itself, which is bearCard's.

export type CommitmentForCard = { id: string; title: string; dueOn: string | null; owner: CommitmentOwner; profileId: string };

export type PushedCard = Result & { created?: { taskId: string; assigneeId: string | null; title: string }; note?: string | null };

export async function pushCommitmentCard(input: {
  side: "coach" | "member";
  // Already proven to own this side of the commitment by the caller.
  actor: TeamActor;
  commitment: CommitmentForCard;
  boardId: string;
}): Promise<PushedCard> {
  const { side, actor, commitment } = input;
  if (!input.boardId) return { ok: false, error: "Pick a board." };
  const board = await boardFor(actor, side, input.boardId);
  if (board === "failed") return { ok: false, error: "Could not read that board." };
  if (!board) return { ok: false, error: "You are not a member of that board." };

  // Idempotent: a live card for the promise is the answer. A FAILED check is
  // not "no card yet", so it refuses rather than carding the promise twice.
  const { data: existing, error: existingError } = await anyLiveCardOfSubject(SUBJECT_COMMITMENT, commitment.id);
  if (existingError) return { ok: false, error: "Could not check the Workboard." };
  if ((existing ?? []).length > 0) return { ok: true };

  const assignee = await assigneeFor(actor, side, commitment);
  if (!assignee.ok) return assignee;

  const born = await bearCard({
    card: {
      board_id: board.id,
      board_column_id: board.columnId,
      title: commitment.title,
      assignee_id: assignee.personId,
      due_date: commitment.dueOn,
      priority: "p2",
      subject_type: SUBJECT_COMMITMENT,
      subject_id: commitment.id,
    },
    actor: { label: actor.displayName, personId: actor.personId, isAdmin: actor.isAdmin },
    refreshSlugs: [board.slug],
  });
  if (!born.ok && !("persisted" in born)) return { ok: false, error: "Could not add the card." };
  // The card exists from here even when its history did not land, so the push
  // succeeded; the failure is the log's, not the person's to retry.
  if (!born.ok) console.error("[coaching/commitment-card]", born.error);
  // The sprint goes on after the card exists, the way the board's own form
  // does it. A refusal (a sprint locked for planning) leaves the card in the
  // backlog: the card exists, so the push still succeeded.
  const sprint = board.sprintId ? await setCardSprint(born.id, board.sprintId, board.slug) : { ok: true as const };
  return {
    ok: true,
    // The id goes back so the assignment reaches the person's inbox (TH.2).
    created: { taskId: born.id, assigneeId: assignee.personId, title: commitment.title },
    note: sprint.ok ? null : `The card waits outside this week's sprint: ${sprint.error}`,
  };
}

/**
 * The board a card goes on: one the actor works on, with its first open column
 * and its open sprint (pickableBoards). A coach who is an admin is offered
 * every active board (coachBoards), so an admin coach's pick of a board they
 * are not on is honoured too, in its first open column and outside any sprint,
 * which is where the coach's push used to put every card.
 */
async function boardFor(actor: TeamActor, side: "coach" | "member", boardId: string): Promise<PickableBoard | null | "failed"> {
  const mine = (await pickableBoards(actor)).find((b) => b.id === boardId);
  if (mine || side !== "coach" || !actor.isAdmin) return mine ?? null;
  const [boardRes, columnRes] = await Promise.all([activeBoard(boardId), firstOpenColumn(boardId)]);
  if (boardRes.error || columnRes.error) return "failed";
  const b = boardRes.data;
  const column = columnRes.data;
  if (!b || !column) return null;
  return { id: b.id, slug: b.slug, name: b.name, columnId: column.id, sprintId: null };
}

/**
 * Who the card is for: the coached person for a member commitment, the coach
 * for a coach commitment. The member pushing their own promise is that person.
 */
async function assigneeFor(actor: TeamActor, side: "coach" | "member", c: CommitmentForCard): Promise<{ ok: true; personId: string | null } | { ok: false; error: string }> {
  if (side === "member") return { ok: true, personId: actor.personId };
  const { data: prof, error: profError } = await companyOs.from("coaching_profiles").select("team_member_id, coach_id").eq("id", c.profileId).maybeSingle();
  if (profError) return { ok: false, error: "Could not read who the card is for." };
  const p = prof as { team_member_id: string; coach_id: string } | null;
  const teamMemberId = c.owner === "coach" ? p?.coach_id : p?.team_member_id;
  if (!teamMemberId) return { ok: true, personId: null };
  const { data: tm, error: tmError } = await companyOs.from("team_members").select("person_id").eq("id", teamMemberId).maybeSingle();
  if (tmError) return { ok: false, error: "Could not read who the card is for." };
  return { ok: true, personId: (tm as { person_id: string } | null)?.person_id ?? null };
}
