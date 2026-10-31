// The one read behind a Bounty drafted by Claude (QS.9): the Summon drawer's
// own staff list, which the draft's names are resolved against. It writes
// nothing and sends nothing; bounty-draft.ts says why the draft is safe to hand
// back as a link.
import { planDraft, type DraftOutcome } from "./bounty-draft";
import { listStaffPortraits } from "./party-picker";

/** The draft and its link for one person, read against the Summon drawer's staff list. Writes nothing. A failed read raises. */
export async function draftBounty(raw: unknown, reader: { personId: string }, callId: string, now: Date = new Date()): Promise<DraftOutcome> {
  return planDraft(raw, await listStaffPortraits(), reader.personId, callId, now);
}
