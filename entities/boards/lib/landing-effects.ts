// What a card owes once its row is where it is, written once (A.53).
//
// A card arrives in a column two ways: it moves there (landCard, land-card.ts)
// or it is born there (bearCard, bear-card.ts). Either way the arrival owes the
// same four things in the same order: the stage-log row the Flow view ages the
// card from, the audit row, the refreshed pages, and the events a subscriber
// acts on. Before this file only a move paid all four; the births each paid
// their own subset, so a card made straight into Done set its completion date
// and announced nothing, and four of nine births had no create row.
//
// It lives apart from land-card.ts because land-card.ts reaches repeat-write.ts
// for a repeating card's successor, and a successor is itself a birth: one file
// for the follow-ups keeps the module graph a line rather than a loop.
import { recordAudit } from "@/kernel/audit/audit";
import { publish } from "@/kernel/events";
import type { BoardActor } from "./access";
import { refresh } from "./card-helpers";
import type { TaskStatus } from "./types";
import { insertTaskStageLog } from "./writes";

export type Arrival = {
  taskId: string;
  // The stage-log row's `kind`. A `create` has no origin column, so its
  // row's `from_column_id` is null whatever the caller passes.
  entry: "move" | "create";
  fromColumnId: string | null;
  toColumnId: string;
  // The sprint a created card begins in, for the create row's `to_sprint_id`.
  // A move leaves the sprint as it was and logs none.
  toSprintId?: string | null;
  actor: BoardActor;
  logNote: string | null;
  // A birth is audited as an insert of the row, a move as an update.
  audit: { operation: "insert" | "update"; newData: Record<string, unknown> };
  refreshSlugs: string[];
  boardSlug: string;
  status: TaskStatus;
  // Whether this arrival COMPLETES the card (becomesDone), which only the
  // caller can say: a move needs the column it left, a birth has none.
  completes: boolean;
  subject: { type: string | null; id: string | null };
  // The card as written, for the events' title and assignee (S.3) and the
  // spark it was picked up from (W.192); null when the write returned no row.
  card: { title: string; assignee_id: string | null; metadata: unknown } | null;
};

/**
 * The follow-ups of an arrival whose row has persisted. Every one is tried
 * whatever happened to the one before it, and the stage log's failure is
 * returned rather than thrown, for the caller to report after its own
 * follow-ups: the audit row and the events were earned by the write, so
 * returning on a failed log first left a done move with no audit row and a
 * commitment nobody marked kept.
 *
 * Returns the stage log's error message, or null when it was written.
 */
export async function arrivalFollowUps(a: Arrival): Promise<string | null> {
  const { taskId, actor } = a;
  const addressed = a.card
    ? { title: a.card.title, assigneeId: a.card.assignee_id, actorPersonId: actor.personId }
    : { actorPersonId: actor.personId };
  // The spark a card was picked up from rides on the completion (W.192), so the
  // ideas entity can say it shipped without reading the card again.
  const ideaId = (a.card?.metadata as { idea_id?: unknown } | null | undefined)?.idea_id;
  const fromSpark = typeof ideaId === "string" && ideaId ? { ideaId } : {};

  // There is no transaction (that needs an RPC and a migration, deferred), so
  // each follow-up reports its own failure after every follow-up has had its
  // turn, and the caller's message says what did land.
  const { error: logErr } = await insertTaskStageLog({
    task_id: taskId,
    from_column_id: a.entry === "create" ? null : a.fromColumnId,
    to_column_id: a.toColumnId,
    ...(a.entry === "create" && a.toSprintId !== undefined ? { to_sprint_id: a.toSprintId } : {}),
    kind: a.entry,
    moved_by: actor.personId,
    note: a.logNote,
  });

  // The write has persisted, so it is audited here even when the log failed:
  // the card really is where it is and the trail should say so.
  await recordAudit({ table: "tasks", recordId: taskId, operation: a.audit.operation, actor: actor.label, newData: a.audit.newData });
  for (const slug of a.refreshSlugs) refresh(slug);

  // Published after the write has persisted and been audited, so a subscriber
  // never acts on a card that is not there, and under the board the card now
  // lives on, so a subscriber that links back links to where the card is.
  // Handler failures are the bus's to log and audit; they cannot fail this.
  if (a.completes) {
    await publish("board.card.completed", { taskId, boardSlug: a.boardSlug, subjectType: a.subject.type, subjectId: a.subject.id, ...fromSpark, ...addressed });
  }
  // Every arrival, whatever it did to the status, for the subscriber whose
  // card stands for something else's state (a day of content, a campaign).
  await publish("board.card.landed", { taskId, boardSlug: a.boardSlug, status: a.status, subjectType: a.subject.type, subjectId: a.subject.id, ...fromSpark, ...addressed });
  return logErr ? logErr.message : null;
}
