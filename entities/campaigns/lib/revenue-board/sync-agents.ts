import { addDays } from "@/kernel/config/dates";
import { endPosition, insertTasks, landCardAsSystem, selectTasks, updateTasks } from "@/entities/boards";
import { companyOs } from "@/kernel/data/supabase";
import type { ContentBoard } from "./board";
import {
  SUBJECT_CAMPAIGN,
  agentState,
  alreadyMade,
  previousWriterNote,
  writerDescription,
  writerNote,
  type AgentState,
  type SyncCampaign,
} from "./rules";
import { SYNC_LABEL } from "./sync-days";

// The writer agent's work on the Revenue board: one card per campaign it runs,
// marked as agent work (metadata.source = "agent", the board's Agent chip), in
// the column that says where the writer is. A stuck campaign waits on a person,
// so its card goes to Waiting, assigned to the board's owner, with the error
// appended to its description; that is what the twice-daily nag chases.
//
// As with the day cards, the card moves only when the WRITER's state changes
// (metadata.agent_state), so a person's drag is never undone by the next pass.
// The description is shared the same way: the sync writes only its own note
// and leaves every word a person typed (rules.ts, writerDescription), with the
// error it last reported kept in metadata.writer_error so the next pass knows
// which note is its own.

// A campaign a week either side of today: the one being written, the ones
// queued behind it, and the week that just finished.
const WINDOW_DAYS = 7;

type AgentCard = {
  id: string;
  status: string;
  archived_at: string | null;
  subject_id: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};
type CampaignRow = SyncCampaign & { updated_at: string };

export type AgentSyncResult = { created: number; moved: number; errors: string[] };

function columnFor(board: ContentBoard, s: AgentState): string {
  const c = board.columns;
  return s === "done" ? c.done : s === "not_doing" ? c.notDoing : s === "stuck" ? c.waiting : s === "working" ? c.doing : c.todo;
}

const statusFor = (s: AgentState) => (s === "done" ? "done" : s === "not_doing" ? "not_doing" : "open");

export async function syncAgentCards(board: ContentBoard, today: string): Promise<AgentSyncResult> {
  const out: AgentSyncResult = { created: 0, moved: 0, errors: [] };
  const { data: campRows, error: campErr } = await companyOs
    .from("marketing_campaigns")
    .select("id, name, status, starts_on, writer_step, writer_error, updated_at")
    .gte("starts_on", addDays(today, -WINDOW_DAYS))
    .lte("starts_on", addDays(today, WINDOW_DAYS))
    .in("status", ["active", "done", "archived"]);
  if (campErr) return { ...out, errors: [`campaigns: ${campErr.message}`] };
  const campaigns = (campRows ?? []) as CampaignRow[];
  if (campaigns.length === 0) return out;

  const { data: cardRows, error: cardErr } = await selectTasks("id, status, archived_at, subject_id, description, metadata")
    .eq("board_id", board.id)
    .eq("subject_type", SUBJECT_CAMPAIGN)
    .in("subject_id", campaigns.map((c) => c.id));
  if (cardErr) return { ...out, errors: [`agent cards: ${cardErr.message}`] };
  const cards = new Map(((cardRows ?? []) as unknown as AgentCard[]).map((c) => [c.subject_id, c]));

  for (const c of campaigns) {
    const state = agentState(c);
    const card = cards.get(c.id);
    if (card?.archived_at) continue;
    const stuck = state === "stuck";
    const writerError = stuck ? c.writer_error : null;

    if (!card) {
      const column = columnFor(board, state);
      const { error } = await insertTasks({
        board_id: board.id,
        board_column_id: column,
        title: `Writer: ${c.name}`,
        description: writerNote(writerError),
        status: statusFor(state),
        priority: stuck ? "p1" : "p3",
        assignee_id: stuck ? board.ownerId : null,
        due_date: c.starts_on,
        epic_id: board.epicId,
        subject_type: SUBJECT_CAMPAIGN,
        subject_id: c.id,
        metadata: { source: "agent", agent_state: state, writer_error: writerError },
        position: await endPosition(board.id, column),
        // A campaign already finished is dated by when it finished, so a first
        // pass does not announce last week's work as closed today.
        completed_at: state === "done" ? c.updated_at : null,
      });
      // A unique violation is another pass filing this campaign's card a
      // moment ago; the next pass moves that card like any other.
      if (alreadyMade(error)) continue;
      if (error) out.errors.push(`${c.name}: ${error.message}`);
      else out.created += 1;
      continue;
    }

    if (card.metadata?.agent_state === state) continue;
    // The writer moved on, so the card follows (a no-op when a person already
    // put it there).
    const moved = await landCardAsSystem({ taskId: card.id, toColumnId: columnFor(board, state), label: SYNC_LABEL });
    if (!moved.ok) {
      out.errors.push(`${c.name}: ${moved.error}`);
      continue;
    }
    out.moved += 1;
    const { error } = await updateTasks({
      metadata: { ...(card.metadata ?? {}), agent_state: state, writer_error: writerError },
      description: writerDescription(card.description, previousWriterNote(card.metadata, card.description), writerNote(writerError)),
      priority: stuck ? "p1" : "p3",
      ...(stuck ? { assignee_id: board.ownerId } : {}),
    }).eq("id", card.id);
    if (error) out.errors.push(`${c.name}: ${error.message}`);
  }
  return out;
}
