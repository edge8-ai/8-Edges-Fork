// Lighthouses as the Quests page draws them (QS.6; spec "Lighthouses",
// "Burning fires and seats" for a held fire; glossary: Beacon, Held fire).
// Pure and browser-safe, beside campfires-model: the page's client components
// take these shapes as props, and lighthouses-read.ts fills them on the server.
//
// A lit Beacon is a quest of kind beacon with its link, not withdrawn. Its
// author is its Giver, because version 10 draws only a Beacon lit by its own
// author (a Beacon given to someone else is out of scope). Nothing here counts
// views, likes or reach, and nothing orders a Beacon by who lit it: the
// horizon stands in the order they were lit.
//
// A held fire is a Raid whose session ended, was not cancelled, and had
// someone other than its Host attend: the ladders' own witness for a fire
// (ladders spec, "A Raid hosted that someone came to"). The rule lives once,
// in evolve-model.ts beside Evolve's other threshold (QS.7), for the offer on
// the page and for the action that checks it again.
import { isHeld, type FireSession } from "./evolve-model";
import type { HostedRaidRow } from "./rows";

/** A fire the reader hosted that was held and has no Beacon yet: the offer to light it as one. */
export type HeldFire = {
  questId: string;
  title: string;
  /** The learning the fire grew from (QS.7's Evolve); null for a fire lit from Hands. */
  originIdeaId: string | null;
};

/** The reader's held fires that have no Beacon yet, in the order read. `litFrom` holds every fire a live Beacon already grew from. */
export function heldFiresOf(raids: readonly HostedRaidRow[], hostId: string, sessions: ReadonlyMap<string, FireSession>, litFrom: ReadonlySet<string>, now: Date): HeldFire[] {
  return raids
    .filter((r) => !litFrom.has(r.id) && isHeld(hostId, sessions.get(r.training_id), now))
    .map((r) => ({ questId: r.id, title: r.title, originIdeaId: r.origin_idea_id }));
}

