import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { one } from "@/kernel/config/embedded";
import { CHAIN_ORIGIN } from "./items";

// What the boards meeting-cards filer reads of crm's tables, through crm's
// door (decision 1: boards requires crm, so boards pulls; crm never calls
// boards). Only items of a live run are offered: a shadow run's items are
// `proposed` and never filed, and an item someone wrote outside the chain (the
// assistant's database role can write meeting_action_items) has no live run
// behind it, so it files no card.

export type ItemToFile = {
  id: string;
  meetingId: string;
  position: number;
  title: string;
  detail: string | null;
  evidence: string | null;
  ownerName: string | null;
  dueDate: string | null;
  fileState: "to_file" | "needs_board";
  companyId: string;
  companyName: string | null;
  aiProgramId: string | null;
  meetingDate: string | null;
  meetingOwnerId: string | null;
};

type Row = {
  id: string;
  meeting_id: string;
  position: number;
  title: string;
  detail: string | null;
  evidence: string | null;
  owner_name: string | null;
  due_date: string | null;
  file_state: string;
  meeting: {
    company_id: string | null;
    ai_program_id: string | null;
    started_at: string | null;
    owner_id: string | null;
    archived_at: string | null;
    company: { name: string | null } | { name: string | null }[] | null;
    meeting_followups: { mode: string } | { mode: string }[] | null;
  } | null;
};

/**
 * Chain items waiting for a card: `to_file` for the tick, or `needs_board`
 * when a person picks the board for one meeting. Oldest first, at most
 * `limit`. A failed read throws: the filer must not take "nothing to file" for
 * an answer it did not get.
 */
export async function meetingActionsToFile(opts: { limit: number; meetingId?: string; states?: ("to_file" | "needs_board")[] }): Promise<ItemToFile[]> {
  // The meeting and its live run are inner joins filtered in the query, so an
  // item that can never be filed (its meeting archived, its run a shadow one)
  // is not read at all and cannot fill the window ahead of one that can.
  let q = companyOs
    .from("meeting_action_items")
    .select(
      "id, meeting_id, position, title, detail, evidence, owner_name, due_date, file_state, meeting:meetings!meeting_id!inner(company_id, ai_program_id, started_at, owner_id, archived_at, company:companies!company_id(name), meeting_followups!inner(mode))",
    )
    .eq("origin", CHAIN_ORIGIN)
    .is("meeting.archived_at", null)
    .not("meeting.company_id", "is", null)
    .eq("meeting.meeting_followups.mode", "live")
    .in("file_state", opts.states ?? ["to_file"])
    .is("task_id", null)
    .order("created_at")
    .order("position")
    .limit(opts.limit);
  if (opts.meetingId) q = q.eq("meeting_id", opts.meetingId);
  const rows = mustRows(await q, "[meeting-actions] items to file") as unknown as Row[];
  return rows.flatMap((r) => {
    const m = r.meeting;
    const run = one(m?.meeting_followups ?? null);
    if (!m || !m.company_id || m.archived_at || run?.mode !== "live") return [];
    return [
      {
        id: r.id,
        meetingId: r.meeting_id,
        position: r.position,
        title: r.title,
        detail: r.detail,
        evidence: r.evidence,
        ownerName: r.owner_name,
        dueDate: r.due_date,
        fileState: r.file_state === "needs_board" ? "needs_board" : "to_file",
        companyId: m.company_id,
        companyName: one(m.company)?.name ?? null,
        aiProgramId: m.ai_program_id,
        meetingDate: m.started_at ? m.started_at.slice(0, 10) : null,
        meetingOwnerId: m.owner_id,
      },
    ];
  });
}

/**
 * Set aside the chain's waiting items whose meeting was archived: they will
 * never be filed, and a person who archived the meeting did not want its
 * cards. Answers how many. Run by the crm driver.
 */
export async function dismissArchivedMeetingActions(): Promise<number> {
  const rows = mustRows(
    await companyOs
      .from("meeting_action_items")
      .select("id, meeting:meetings!meeting_id!inner(archived_at)")
      .eq("origin", CHAIN_ORIGIN)
      .in("file_state", ["to_file", "needs_board", "proposed"])
      .is("task_id", null)
      .not("meeting.archived_at", "is", null)
      .limit(200),
    "[meeting-actions] items of archived meetings",
  ) as { id: string }[];
  if (rows.length === 0) return 0;
  const { error } = await companyOs
    .from("meeting_action_items")
    .update({ file_state: "dismissed", file_note: "The meeting was archived, so no card is filed." })
    .in(
      "id",
      rows.map((r) => r.id),
    )
    .is("task_id", null);
  if (error) throw new Error(`[meeting-actions] dismiss items of archived meetings: ${error.message}`);
  return rows.length;
}
