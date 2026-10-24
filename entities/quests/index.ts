// The quests entity's server door (QS.1, spec 2026-10-20; ADR 0019): the
// Bounties, Raids and Beacons people take on to live the company's values of
// learning and sharing. It exports the Quests page's read model, the types the
// page is drawn from, and the page's server actions. The assistant's tools
// arrive in a later ticket and are exported here when they do.
export { readParty, readQuestsPage } from "./lib/quests-read";
export type { HeadCard, Monster, Portrait, QuestCard, QuestKind, QuestsPage, Standing } from "./lib/quests-read";
export { acceptQuest, closeQuest, handBack, reactToTurnIn, summonBounty, turnIn, withdrawQuest } from "./lib/quest-actions";
export type { SummonBountyInput } from "./lib/quest-actions";
// The Lore (QS.4): Spark's newest learnings as the page draws them, and its
// two moves, which write through the Ideas door.
export { readLore } from "./lib/lore-read";
export { shareLearning, willTry } from "./lib/lore-actions";
// Campfires (QS.5): the wanted topics and the burning fires, and their moves:
// a hand raised and lowered, a cold fire lit, a seat taken and left. A fire's
// session and its seats are written through the Training door.
export { readCampfires } from "./lib/campfires-read";
export { leaveSeat, lightFire, lowerHand, raiseHand, takeSeat } from "./lib/campfire-actions";
// Lighthouses (QS.6): every lit Beacon on the horizon and the reader's held
// fires with no Beacon yet, and the one move that lights a Beacon, writing the
// quest's lit_url and the author's own Turn-in link in one action.
export { readLighthouses } from "./lib/lighthouses-read";
export { lightBeacon } from "./lib/beacon-actions";
// One question for the ladders (LD.1; ADR 0021): a person's Turn-ins and the
// Raids they host, as recorded, judged by nobody here. And, for a register
// mark (LD.2), who hosts the Raid behind a Training session.
export { questActsOf, raidHostsOf } from "./lib/acts";
export type { QuestActs, RaidHosted, TurnInAct } from "./lib/acts";
// And for the badges found by doing (LD.7): the person's accepted and turned-in
// party rows with their quests, the quests they gave and host, and the
// Reactions on those Turn-ins. Never a row that was handed back or missed.
export { questFactsOf } from "./lib/act-facts";
export type { PartyFact, QuestFact, QuestFacts, ReactionFact } from "./lib/act-facts";
// The quest log (QS.3's self audience, LD.6): the reader's own quests with
// their Standing on each head, Missed included, for the profile's Quest log
// tab, which only its owner sees.
export { QuestLog } from "./ui/QuestLog";
