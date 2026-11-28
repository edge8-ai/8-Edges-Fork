// What is left of the Quests page's read model after the page retired (AK.4,
// ADR 0036): the staff the New ask drawer calls from, the paged read of a
// quest's party rows that the Asks read (asks-read.ts) and the manager report
// share, and how far back a closed quest stays nameable. The Quests page's
// own shaping (the boss, the board, the season, the lore) went with the page.
// ADR 0020's rule that nobody learns who is still out is kept where the party
// is joined to names now: asks-read.ts, the manager report (quest-report.ts)
// and the assistant's reads.
import { mustRows } from "@/kernel/data/read";
import { listStaffPortraits, type Portrait } from "./party-picker";
import { PARTY_COLUMNS, type PartyDbRow } from "./rows";
import { selectQuestParty } from "./reads";

export type { Portrait };

/** How far back a manager may name a closed quest to the assistant (QS.9); also how long a closed quest was kept on the old board. */
export const RECENT_DAYS = 14;

/**
 * PostgREST returns at most 1,000 rows a call, so a long party is read a page
 * at a time rather than cut short. The Asks read (asks-read.ts) asks for one
 * more column, the answer's link, and names its row.
 */
export async function allPartyRows<Row = PartyDbRow>(questIds: string[], columns: string = PARTY_COLUMNS): Promise<Row[]> {
  const out: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const page = mustRows(
      await selectQuestParty(columns).in("quest_id", questIds).order("id").range(from, from + PAGE - 1),
      "[quests/read] quest_party",
    ) as unknown as Row[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** Who the New ask drawer may call: staff only, people with a current team_members row. */
export async function readParty(): Promise<Portrait[]> {
  return listStaffPortraits();
}
