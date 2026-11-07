// What is open for one person (QS.9; spec 2026-10-20, "Claude", story 53;
// ADR 0020): the read behind the team assistant's "what quests are open for
// me?". It answers about the reader alone. The Bounties come from the
// reader's own party rows, so no other person's Standing is ever selected,
// and the only other people it names are each Bounty's Giver and each fire's
// Host, whom the whole team already sees on the page. The fires are the
// Campfires read's, narrowed to the ones the reader sits by or hosts, and the
// Beacons to light are the Lighthouses read's held fires, so the assistant
// can never describe a fire differently from the page.
//
// Nothing here counts across quests: each Bounty carries the reader's own
// Standing on its own heads, and a Missed is the reader's own, on that quest.
//
// The fetch and the shaping are split, as the page's read is, so the audience
// rule is tested on rows in memory.
import { mustPagesIn } from "@/kernel/data/read";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { readCampfires } from "./campfires-read";
import { saigonDue, type BurningFire } from "./campfires-model";
import { readHeldFires } from "./lighthouses-read";
import type { HeldFire } from "./lighthouse-model";
import { selectQuestHeads, selectQuestParty, selectQuests } from "./reads";
import { hasClosed, type QuestState, type Standing } from "./standing";

/** One open head of a Bounty the reader is on, with their own Standing on it. */
export type OpenHead = {
  ask: string;
  /** The due time, ISO. */
  dueAt: string;
  /** The due time in Saigon: "Fri 31 Oct, 18:00 Saigon". */
  due: string;
  yours: Standing;
};

/** A Bounty the reader is called on or has accepted, still open for them. */
export type OpenBounty = {
  title: string;
  /** The Giver's opening note; null when they left it empty. */
  note: string | null;
  giver: string;
  /** A manager or an admin gave it: no Accept and no hand-back, everyone called is committed. */
  required: boolean;
  /** The open heads the reader still owes, in the Giver's order. */
  heads: OpenHead[];
};

/** A burning fire the reader has a seat by or hosts, or their own ended fire still to mark. */
export type OpenFire = {
  title: string;
  host: string;
  youHost: boolean;
  seated: boolean;
  /** The session's start, ISO, and in Saigon. */
  startsAt: string;
  starts: string;
  /** The Host's own ended fire whose register has no mark yet: Mark who came. */
  toMark: boolean;
};

export type OpenQuests = {
  bounties: OpenBounty[];
  fires: OpenFire[];
  /** Fires the reader held with no Beacon yet: each may be lit as a Beacon. */
  beaconsToLight: { title: string }[];
};

type OwnRow = { quest_id: string; head_id: string; person_id: string; standing: Standing };
type BountyRow = { id: string; kind: string; title: string; ask: string; giver_id: string; state: QuestState; required: boolean };
type HeadRow = { id: string; quest_id: string; position: number; ask: string; closes_at: string; closed_at: string | null };

/** A head still owed by the reader: they are called on it, or accepted it, and have not answered. */
const OWED: readonly Standing[] = ["called", "accepted"];

/**
 * The reader's open quests from rows. Only the reader's own rows that are
 * still owed count; any other person's row, or one already answered, is
 * ignored, so a careless fetch cannot widen the answer. A Bounty is listed
 * with each of its open heads the reader still owes.
 */
export function shapeOpenQuests(
  readerPersonId: string,
  rows: { party: readonly OwnRow[]; quests: readonly BountyRow[]; heads: readonly HeadRow[]; names: ReadonlyMap<string, string> },
  fires: readonly BurningFire[],
  heldFires: readonly HeldFire[],
  now: Date,
): OpenQuests {
  const mine = rows.party.filter((r) => r.person_id === readerPersonId && OWED.includes(r.standing));
  const headById = new Map(rows.heads.map((h) => [h.id, h]));
  const bounties: { card: OpenBounty; next: string }[] = [];
  for (const quest of rows.quests) {
    if (quest.kind !== "bounty" || quest.state !== "open") continue;
    const heads = mine
      .filter((r) => r.quest_id === quest.id)
      .map((r) => ({ row: r, head: headById.get(r.head_id) }))
      .filter((x): x is { row: OwnRow; head: HeadRow } => x.head !== undefined && x.head.quest_id === quest.id)
      .filter(({ head }) => !hasClosed({ closesAt: head.closes_at, closedAt: head.closed_at }, now))
      .sort((a, b) => a.head.position - b.head.position);
    if (heads.length === 0) continue;
    bounties.push({
      card: {
        title: quest.title,
        note: quest.ask.trim() ? quest.ask : null,
        giver: rows.names.get(quest.giver_id) ?? "Someone",
        required: quest.required,
        heads: heads.map(({ row, head }) => ({ ask: head.ask, dueAt: head.closes_at, due: saigonDue(head.closes_at), yours: row.standing })),
      },
      next: heads[0]!.head.closes_at,
    });
  }
  return {
    bounties: bounties.sort((a, b) => a.next.localeCompare(b.next)).map((b) => b.card),
    fires: fires
      .filter((f) => f.seated || f.youHost)
      .map((f) => ({ title: f.title, host: f.host.name, youHost: f.youHost, seated: f.seated, startsAt: f.startsAt, starts: saigonDue(f.startsAt), toMark: f.endedAt !== null })),
    beaconsToLight: heldFires.map((f) => ({ title: f.title })),
  };
}

/** What is open for the reader: their owed Bounties, their fires and the Beacons they may light. Every read raises on failure. */
export async function readOpenQuests(readerPersonId: string, now: Date = new Date()): Promise<OpenQuests> {
  const [party, campfires, heldFires] = await Promise.all([
    // Only the reader's own rows still owed: nothing about anyone else is selected.
    mustPagesIn<OwnRow>([readerPersonId], "[quests/open] own party rows", (ids, from, to) =>
      selectQuestParty("quest_id, head_id, person_id, standing").in("person_id", ids).in("standing", ["called", "accepted"]).order("id").range(from, to),
    ),
    readCampfires(readerPersonId, now),
    readHeldFires(readerPersonId, now),
  ]);
  const questIds = [...new Set(party.map((r) => r.quest_id))];
  let quests: BountyRow[] = [];
  let heads: HeadRow[] = [];
  if (questIds.length > 0) {
    [quests, heads] = await Promise.all([
      mustPagesIn<BountyRow>(questIds, "[quests/open] quests", (ids, from, to) =>
        selectQuests("id, kind, title, ask, giver_id, state, required").in("id", ids).eq("kind", "bounty").eq("state", "open").order("id").range(from, to),
      ),
      mustPagesIn<HeadRow>(questIds, "[quests/open] heads", (ids, from, to) =>
        selectQuestHeads("id, quest_id, position, ask, closes_at, closed_at").in("quest_id", ids).order("id").range(from, to),
      ),
    ]);
  }
  const people = await peopleOnRecord(quests.map((q) => q.giver_id));
  const names = new Map([...people].map(([id, p]) => [id, p.name]));
  return shapeOpenQuests(readerPersonId, { party, quests, heads, names }, campfires.burning, heldFires, now);
}
