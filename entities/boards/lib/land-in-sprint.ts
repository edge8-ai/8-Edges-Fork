// What happens when a card lands in a sprint, written once (A.41).
//
// land-card.ts is the column half of a card's placement; this is the sprint
// half. Three actions used to spell it out themselves: committing a card to a
// sprint (setCardSprint), rolling a closing sprint's unfinished cards on
// (closeSprint) and undoing a sprint move (undoCardSprint). Each wrote the
// tasks row, the stage-log row and the audit row by hand, and all three
// returned on a failed stage-log write BEFORE the audit row, so a sprint move
// that had persisted went unaudited (BUG-5). That is the order landCard was
// fixed out of in A.1, and the copies had kept the old one.
//
// The callers decide WHICH cards go WHERE and whether the lock applies; this
// module owns what landing means: the target is a sprint on this board, a
// locked sprint still in its planning window refuses (W.120), one write moves
// the cards, every card gets its row in the history and its row in the audit
// trail, and a failure after the write says what did land.
import { recordAuditMany } from "@/kernel/audit/audit";
import { saigonToday } from "@/kernel/config/dates";
import { companyOs } from "@/kernel/data/supabase";
import type { BoardActor } from "./access";
import { refresh } from "./card-helpers";
import type { CardMoveOutcome } from "./land-card";
import { sprintLockRefusal, type LockableSprint } from "./sprint-lock";
import { insertTaskStageLog, updateTasks } from "./writes";

export type SprintLanding = {
  // One card for a move or an undo; every unfinished card for a rollover.
  taskIds: string[];
  // Already gated by the caller through boardMutation.
  actor: BoardActor;
  // The board the cards are on, which the target sprint must be on too.
  boardId: string;
  // The sprint the cards leave and the one they land in; null is the backlog.
  // A rollover's `from` is the sprint being closed.
  from: string | null;
  to: string | null;
  // The stage-log row's kind. Kept as the values the history already holds:
  // the Flow view and carry-history read them.
  kind: "sprint_move" | "sprint_rollover";
  // Whether the sprint lock refuses this landing. A person moving a card is
  // refused by a locked sprint at either end; closing a sprint is exempt,
  // because closing is the act the lock exists to make possible (W.120).
  lock: "apply" | "exempt";
  logNote: string | null;
  // The board slugs whose pages the landing invalidates.
  refreshSlugs: string[];
};

type SprintRow = LockableSprint & { id: string; board_id: string; status: string };

export async function landInSprint(l: SprintLanding): Promise<CardMoveOutcome> {
  const { taskIds, actor, from, to } = l;

  // Both ends in one read when the lock applies; only the target otherwise,
  // since an exempt landing asks nothing of the sprint it leaves.
  const ids = [...new Set([to, l.lock === "apply" ? from : null].filter((id): id is string => id !== null))];
  const byId = new Map<string, SprintRow>();
  if (ids.length) {
    const { data, error } = await companyOs.from("sprints").select("id, board_id, name, status, locked_at, starts_on").in("id", ids);
    if (error) return { ok: false, error: `Could not read the sprint: ${error.message}` };
    for (const s of (data ?? []) as SprintRow[]) byId.set(s.id, s);
  }
  const target = to ? byId.get(to) : null;
  if (to && (!target || target.board_id !== l.boardId)) return { ok: false, error: "That sprint is not on this board." };
  // A closed sprint is history (W.202.3): a card filed into it shows on no
  // live sprint and skews the week it already reported.
  if (target?.status === "closed") return { ok: false, error: `${target.name} is closed. Pick an open sprint.` };
  if (l.lock === "apply") {
    const refusal = sprintLockRefusal(from ? byId.get(from) ?? null : null, target ?? null, saigonToday());
    if (refusal) return { ok: false, error: refusal };
  }
  // Nothing to land is not a failure: a sprint can close with every card done.
  // The target is still checked above, so a rollover into another board's
  // sprint is refused whether or not anything would have rolled.
  if (!taskIds.length) return { ok: true };

  const { error } = await updateTasks({ sprint_id: to }).in("id", taskIds);
  if (error) return { ok: false, error: error.message };

  // From here the cards are in their new sprint. There is no transaction (that
  // needs an RPC and a migration), so the follow-ups each have their turn and
  // the failure is reported last, saying what did land.
  const { error: logErr } = await insertTaskStageLog(
    taskIds.map((id) => ({ task_id: id, from_sprint_id: from, to_sprint_id: to, kind: l.kind, moved_by: actor.personId, note: l.logNote })),
  );
  // Audited whatever the history did: the cards really did change sprint and
  // the trail should say so. Returning on the log error first is BUG-5.
  await recordAuditMany(
    taskIds.map((id) => ({ table: "tasks", recordId: id, operation: "update" as const, actor: actor.label, newData: { sprint_id: to } })),
  );
  for (const slug of l.refreshSlugs) refresh(slug);

  if (logErr) {
    const landed = l.kind === "sprint_rollover" ? "Cards rolled over" : "Sprint changed";
    return { ok: false, persisted: true, error: `${landed}, but the stage history could not be written: ${logErr.message}` };
  }
  return { ok: true };
}
