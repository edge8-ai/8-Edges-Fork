// The Asks row's count on the team sidebar (AK.2; spec story 37): how many asks
// wait on the reader, which is the length of the Asks page's Waiting on you,
// shaped by the same rule (asks-read.ts, readWaitingCount). app/shell.ts hands
// it to the team layout as the asksNavCounts slot (slots.ts), keyed by the
// row's address as the Inbox's count is.
//
// Every team page draws the sidebar, so a failure here must not break one. The
// read raises, and this answers no count rather than a wrong one.
import { ASKS_HREF } from "../ui/team-nav";
import { readWaitingCount } from "./asks-read";

export async function asksNavCounts(personId: string): Promise<Record<string, number>> {
  try {
    return { [ASKS_HREF]: await readWaitingCount(personId, new Date()) };
  } catch (err) {
    console.error("[quests/asks-count]", err instanceof Error ? err.message : err);
    return {};
  }
}
