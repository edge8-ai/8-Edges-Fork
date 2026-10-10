import { companyOs } from "@/kernel/data/supabase";
import { CHAIN_ORIGIN } from "./items";

// The boards meeting-cards filer (Z.13) writes a filed card back onto the
// chain's action item, and parks a meeting's items when it has no single board
// to put them on, through these two writers on crm's door (crm owns
// meeting_action_items; the table-ownership rule). Both are fenced to the
// chain's own rows, so a coaching item is never touched, and to an item with
// no card yet, so a second filer never overwrites the first card. Each returns
// the PostgREST builder, so the caller checks the error.

export const markMeetingActionFiled = (itemId: string, taskId: string, note: string | null) =>
  companyOs
    .from("meeting_action_items")
    .update({ task_id: taskId, file_state: "filed", file_note: note })
    .eq("id", itemId)
    .eq("origin", CHAIN_ORIGIN)
    .or(`task_id.is.null,task_id.eq.${taskId}`);

export const markMeetingActionsNeedBoard = (itemIds: string[], note: string) =>
  companyOs
    .from("meeting_action_items")
    .update({ file_state: "needs_board", file_note: note })
    .in("id", itemIds)
    .eq("origin", CHAIN_ORIGIN)
    .eq("file_state", "to_file")
    .is("task_id", null);
