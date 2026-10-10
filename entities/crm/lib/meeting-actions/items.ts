import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";

// The meeting-to-actions chain's own action items (Z.13): rows of
// company_os.meeting_action_items with origin 'meeting-actions'. Coaching rows
// (origin null) are never read or written here. A failed read throws (rule 2):
// "no items" would ask the model again.

// ── The chain's action items ─────────────────────────────────────────────────

export const CHAIN_ORIGIN = "meeting-actions";

export type FileState = "proposed" | "to_file" | "filed" | "needs_board" | "client" | "dismissed";

export type ChainItem = {
  id: string;
  meetingId: string;
  position: number;
  title: string;
  detail: string | null;
  ownerSide: "edge8" | "client" | "unclear";
  ownerName: string | null;
  evidence: string | null;
  dueDate: string | null;
  fileState: FileState;
  fileNote: string | null;
  taskId: string | null;
  shadowMark: "useful" | "not_useful" | null;
};

const ITEM_COLUMNS = "id, meeting_id, position, title, detail, owner_side, owner_name, evidence, due_date, file_state, file_note, task_id, shadow_mark";

type ItemRow = {
  id: string;
  meeting_id: string;
  position: number;
  title: string;
  detail: string | null;
  owner_side: string | null;
  owner_name: string | null;
  evidence: string | null;
  due_date: string | null;
  file_state: string | null;
  file_note: string | null;
  task_id: string | null;
  shadow_mark: string | null;
};

function toItem(r: ItemRow): ChainItem {
  return {
    id: r.id,
    meetingId: r.meeting_id,
    position: r.position,
    title: r.title,
    detail: r.detail,
    ownerSide: r.owner_side === "client" ? "client" : r.owner_side === "edge8" ? "edge8" : "unclear",
    ownerName: r.owner_name,
    evidence: r.evidence,
    dueDate: r.due_date,
    fileState: (r.file_state ?? "proposed") as FileState,
    fileNote: r.file_note,
    taskId: r.task_id,
    shadowMark: r.shadow_mark === "useful" || r.shadow_mark === "not_useful" ? r.shadow_mark : null,
  };
}

/** The chain's items for one meeting, in their order. Coaching rows (origin null) are never among them. */
export async function chainItems(meetingId: string): Promise<ChainItem[]> {
  const rows = mustRows(
    await companyOs.from("meeting_action_items").select(ITEM_COLUMNS).eq("meeting_id", meetingId).eq("origin", CHAIN_ORIGIN).order("position"),
    "[meeting-actions] items",
  ) as ItemRow[];
  return rows.map(toItem);
}

export type NewItem = Omit<ChainItem, "id" | "meetingId" | "taskId" | "shadowMark" | "fileNote">;

/**
 * Write the extract's items in one insert. A second insert at the same
 * positions (a retry racing the first) fails on the chain's once-index and
 * writes nothing, and the caller reads what is there instead.
 */
export async function insertChainItems(meetingId: string, items: NewItem[]): Promise<"inserted" | "exists"> {
  if (items.length === 0) return "inserted";
  const { error } = await companyOs.from("meeting_action_items").insert(
    items.map((i) => ({
      meeting_id: meetingId,
      position: i.position,
      title: i.title,
      detail: i.detail,
      owner_side: i.ownerSide,
      owner_name: i.ownerName,
      evidence: i.evidence,
      due_date: i.dueDate,
      file_state: i.fileState,
      origin: CHAIN_ORIGIN,
    })),
  );
  if (!error) return "inserted";
  if (error.code === "23505") return "exists";
  throw new Error(`[meeting-actions] items: ${error.message}`);
}

/** A person's mark on a shadow run's proposed item (the precision measure). */
export async function markItem(itemId: string, mark: "useful" | "not_useful"): Promise<boolean> {
  const { data, error } = await companyOs
    .from("meeting_action_items")
    .update({ shadow_mark: mark })
    .eq("id", itemId)
    .eq("origin", CHAIN_ORIGIN)
    .eq("file_state", "proposed")
    .select("id");
  if (error) throw new Error(`[meeting-actions] mark item: ${error.message}`);
  return (data ?? []).length > 0;
}
