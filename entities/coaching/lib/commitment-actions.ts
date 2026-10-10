"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import {
  coachReorderCommitments,
  coachAddCommitment,
  coachPushCommitmentToBoard,
  coachUpdateCommitment,
} from "./data/commitments";
import { coachDismissCardDone } from "./data/commitment-owner-writes";
import { parseInput, zDay, zId, zText, zLooseText } from "./schemas";
import { z } from "zod";
import { notifyBoardAssignee } from "@/entities/boards";
import type { CommitmentOwner, CommitmentStatus } from "./types";
import type { Result } from "@/kernel/data/result";
import { refreshCoachAndDirectory } from "./revalidate";

// The shapes this file accepts. Co-located with the actions that use them, as
// the playbook asks, and each message is the sentence the member reads.
const S = {
  add: z.object({
    profileId: zId,
    title: zText(500, "Write the commitment first."),
    owner: z.enum(["coach", "member"]),
    dueOn: zDay.nullable(),
  }),
  status: z.object({
    commitmentId: zId,
    status: z.enum(["open", "on_track", "needs_attention", "completed", "dropped", "blocked"]),
    note: zLooseText(2_000),
  }),
  // A whole column's worth of ids. Capped because the array is the payload:
  // without a bound, one request can ask the writer to renumber anything.
  reorder: z.array(zId).max(500, "That is more cards than a column holds."),
  retitle: z.object({ commitmentId: zId, title: zText(500, "The commitment needs a title.") }),
  plan: z.object({ commitmentId: zId, plan: zLooseText(1_000) }),
  dismiss: z.object({ commitmentId: zId, profileId: zId }),
  push: z.object({ commitmentId: zId, boardId: zId, profileId: zId }),
};

// The coach's actions about COMMITMENTS: adding one, moving it, renaming it,
// ranking the column, the "when will you do it?" plan, declining the board's
// suggestion, and pushing one onto a task board.
//
// Split out of actions.ts with the meeting actions (ticket 13). Ownership is
// re-derived by every data helper below, so the ids here are client input that
// has been shape-checked and nothing more.


export async function addCommitment(
  profileId: string,
  title: string,
  owner: CommitmentOwner,
  dueOn: string | null,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.add, { profileId, title, owner, dueOn });
  if (!p.ok) return p;
  const res = await coachAddCommitment(actor, p.data.profileId, p.data);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function updateCommitmentStatus(
  commitmentId: string,
  status: CommitmentStatus,
  note: string,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.status, { commitmentId, status, note });
  if (!p.ok) return p;
  const res = await coachUpdateCommitment(actor, p.data.commitmentId, {
    status: p.data.status,
    statusNote: p.data.note,
  });
  if (res.ok) refreshCoachAndDirectory();
  return res;
}

// Rewording a commitment from the board (K.14): a commitment is a target, and a
// target can change whenever. The writer records the old and the new wording, so
// the card can show how many times it has changed.
// The order of a column on the coach's own board (K.66).
export async function reorderCommitments(orderedIds: string[]): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.reorder, orderedIds);
  if (!p.ok) return p;
  // Refresh like every other coach write (K.79). Without it the board's
  // optimistic order lapsed when the transition ended, no new props arrived,
  // and the cards snapped back until a reload.
  const res = await coachReorderCommitments(actor, p.data);
  if (res.ok) refreshCoachAndDirectory();
  return res;
}

export async function retitleCommitment(commitmentId: string, title: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.retitle, { commitmentId, title });
  if (!p.ok) return p;
  const res = await coachUpdateCommitment(actor, p.data.commitmentId, { title: p.data.title });
  if (res.ok) refreshCoachAndDirectory();
  return res;
}


// "When will you do it?" on a coach-owned commitment (L.1). The mirror of
// setMyCommitmentPlan: each side plans the promises that are theirs.
export async function setCommitmentPlan(commitmentId: string, plan: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.plan, { commitmentId, plan });
  if (!p.ok) return p;
  const res = await coachUpdateCommitment(actor, p.data.commitmentId, { plan: p.data.plan });
  if (res.ok) refreshCoachAndDirectory();
  return res;
}

// "Not this one" on a coach-owned commitment's board-card suggestion. The
// mirror of dismissMyCardDone: the coach answers for the promises that are
// theirs, the member for theirs, and the board for neither.
export async function dismissCardDone(commitmentId: string, profileId: string): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.dismiss, { commitmentId, profileId });
  if (!p.ok) return p;
  const res = await coachDismissCardDone(actor, p.data.commitmentId);
  if (res.ok) refreshCoachAndDirectory(profileId);
  return res;
}

export async function pushCommitmentToBoard(
  commitmentId: string,
  boardId: string,
  profileId: string,
): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const p = parseInput(S.push, { commitmentId, boardId, profileId });
  if (!p.ok) return p;
  const res = await coachPushCommitmentToBoard(actor, p.data.commitmentId, p.data.boardId);
  if (res.ok) {
    if (res.created) {
      await notifyBoardAssignee(boardId, res.created.assigneeId, res.created.title, actor.personId);
    }
    refreshCoachAndDirectory(profileId);
  }
  return res;
}
