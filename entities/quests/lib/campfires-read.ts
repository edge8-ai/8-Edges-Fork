// The Campfires read (QS.5; spec "Wanted fires: hands", "Burning fires and
// seats", "What the page never shows"). The wanted topics come from Quests'
// own hands; each lit Raid's time and seats come from its Training session,
// through the Training door, because the register is Training's (ADR 0016).
//
// A hand's owner is read here only to count distinct hands and to find the
// reader's own; the value returned names nobody who raised one. The people a
// burning fire names are its Host and the first five seated, as the page draws
// them. Every read raises on failure: an empty section from a failed read
// would tell the reader nobody wants anything and nothing is lit.
import { mustRows } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { taughtSessions } from "@/entities/training";
import { namedByFires, shapeBurning, shapeWanted, type Campfires } from "./campfires-model";
import { HAND_COLUMNS, RAID_COLUMNS, type HandRow, type LitRaidRow } from "./rows";
import { selectQuestHands, selectQuests } from "./reads";

/** More hands than the page could ever draw; a read past it would be a runaway, not a page. */
const HAND_LIMIT = 2000;
/** The newest lit Raids; a fire's session is days ahead, so older ones have long burned out. */
const RAID_LIMIT = 200;

/** The section for one reader: every wanted topic, and every fire still burning. */
export async function readCampfires(readerId: string, now: Date = new Date()): Promise<Campfires> {
  const [handRes, raidRes] = await Promise.all([
    selectQuestHands(HAND_COLUMNS).is("quest_id", null).order("created_at").limit(HAND_LIMIT),
    selectQuests(RAID_COLUMNS)
      .eq("kind", "raid")
      .eq("state", "open")
      .not("host_id", "is", null)
      .not("training_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(RAID_LIMIT),
  ]);
  const hands = mustRows(handRes, "[quests/campfires] quest_hands") as unknown as HandRow[];
  const raids = mustRows(raidRes, "[quests/campfires] raids") as unknown as LitRaidRow[];
  const sessions = raids.length > 0 ? await taughtSessions(raids.map((r) => r.training_id)) : new Map();
  const people = await peopleOnRecord(namedByFires(raids, sessions));
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return { wanted: shapeWanted(hands, readerId), burning: shapeBurning(raids, sessions, names, readerId, now) };
}
