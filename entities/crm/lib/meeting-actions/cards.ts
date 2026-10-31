import { fileMeetingActionCards, fileMeetingActionCardsOn, type BoardActor, type FileOutcome, type MeetingActionLedger } from "@/entities/boards";
import { markMeetingActionFiled, markMeetingActionsNeedBoard } from "./card-links";
import { meetingActionsToFile } from "./filing";

// crm's half of the card filer (Z.13). crm owns the chain's action items, so
// it reads the ones waiting for a card and hands them to boards' filer with
// the two writers that record the outcome on its own rows. Until ADR 0032
// boards required crm and pulled the items itself; a Workboard is complete
// without a CRM, so the edge now runs from crm to boards, which already had
// no path back to crm.
const LEDGER: MeetingActionLedger = { filed: markMeetingActionFiled, needsBoard: markMeetingActionsNeedBoard };

/** The tick: every live run's items waiting for a card, at most 50. */
export async function fileWaitingMeetingActions(): Promise<FileOutcome> {
  return fileMeetingActionCards(await meetingActionsToFile({ limit: 50 }), LEDGER);
}

/**
 * A person's pick of the board for one meeting's waiting items, from the
 * meeting page. `by` is what boardActorFor returned for that board.
 */
export async function fileMeetingItemsOn(meetingId: string, boardId: string, by: BoardActor): Promise<{ ok: true; filed: number } | { ok: false; error: string }> {
  const items = await meetingActionsToFile({ limit: 50, meetingId, states: ["needs_board", "to_file"] });
  return fileMeetingActionCardsOn(items, boardId, by, LEDGER);
}
