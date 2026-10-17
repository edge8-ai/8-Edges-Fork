// A team member's boards. Scope source:
// company_os.board_members for THIS actor's person id, plus active
// staff_assignments (an assignment to a board's client company is implicit
// membership — see lib/boards/access.ts). Admins see every board.
// Every read is filtered to the actor server-side, never from a passed id —
// getBoardForActor returning null IS the authorization for /team/boards/[slug].

import type { TeamActor } from "@/kernel/identity/team-auth";
import { selectBoards, isBoardMember, getBoardBySlug, memberBoardIds } from "@/entities/boards";
import { getWorkboard, type BoardDetail, type WorkboardData } from "@/entities/boards";

// Whether the actor may write to a board (member or admin). Read-side helper
// for UI gating; the write actions re-check via boardActorFor.
export async function isBoardMemberForActor(actor: TeamActor, boardId: string): Promise<boolean> {
  if (actor.isAdmin) return true;
  return isBoardMember(boardId, actor.personId, actor.teamMemberId);
}

// Full board detail iff the actor is a member (or admin). Null otherwise.
export async function getBoardForActor(actor: TeamActor, slug: string): Promise<BoardDetail | null> {
  const detail = await getBoardBySlug(slug);
  if (!detail) return null;
  if (actor.isAdmin) return detail;
  const member = await isBoardMember(detail.board.id, actor.personId, actor.teamMemberId);
  return member ? detail : null;
}

// The member's Workboard: every active board they may work, as one board
// (WB-04). The scope is boards' memberBoardIds, which is the same rule
// isBoardMember applies one board at a time. Admins see every board, as on
// /admin. Nothing here is keyed on client input.
export async function getTeamWorkboard(actor: TeamActor): Promise<WorkboardData> {
  if (actor.isAdmin) return getWorkboard({ scope: { kind: "all" } });
  return getWorkboard({ scope: { kind: "boards", ids: await workableBoardIds(actor) } });
}

// The Workboard tolerates a failed scope read by showing no boards, as it did
// before memberBoardIds learned to raise: an empty board is a visible oddity the
// person reports, where a crashed hub is none of the work they came to do. The
// global search does not tolerate it, and shows cards as unsearchable instead.
async function workableBoardIds(actor: TeamActor): Promise<string[]> {
  try {
    return await memberBoardIds(actor.personId, actor.teamMemberId);
  } catch (err) {
    console.error("[team/boards] board scope", err instanceof Error ? err.message : err);
    return [];
  }
}
