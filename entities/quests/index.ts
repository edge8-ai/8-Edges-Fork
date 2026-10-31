// The quests entity's server door (QS.1, spec 2026-10-20; ADR 0019): the
// Bounties, Raids and Beacons people take on to live the company's values of
// learning and sharing. It exports the Quests page's read model, the types the
// page is drawn from, and the page's server actions, and what the team
// assistant's quest tools read (QS.9).
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
// Evolve (QS.7): a learning three people will try becomes its author's fire.
// Where each of the reader's own learnings stands comes with readLore.
export { hostFireOnLearning } from "./lib/evolve-actions";
// For a register mark (LD.2): who hosts the Raid behind a Training session.
export { raidHostsOf } from "./lib/acts";
// What a person did on Quests, for the ladders' points and badges alike (LD.7,
// A.76): the person's accepted and turned-in party rows with their quests, the
// quests they gave, the Raids they host with each one judged held or not here
// (ADR 0023), and the Reactions on those Turn-ins. Never a row that was handed
// back or missed.
export { questFactsOf } from "./lib/act-facts";
export type { HostedRaid, PartyFact, QuestFact, QuestFacts, ReactionFact } from "./lib/act-facts";
// The quest log (QS.3's self audience, LD.6): the reader's own quests with
// their Standing on each head, Missed included, for the profile's Quest log
// tab, which only its owner sees.
export { QuestLog } from "./ui/QuestLog";
// The team assistant (QS.9): what is open for the reader, theirs alone, and a
// Bounty drafted from an instruction, which writes nothing and returns a link
// that opens the Summon drawer with it filled in.
export { readOpenQuests } from "./lib/open-quests";
export type { OpenBounty, OpenFire, OpenHead, OpenQuests } from "./lib/open-quests";
export { draftBounty } from "./lib/bounty-draft-read";
export type { DraftOutcome } from "./lib/bounty-draft";
// And the manager's one question: who among the people they reach missed one
// named Bounty, through the report's own read and reach (QS.3).
export { askQuestReport } from "./lib/report-question";
export type { ReportAnswer, ReportQuestion } from "./lib/report-question";
// The bus (QS.5c): a Raid whose Training session is cancelled goes out. And
// QS.2: Quests' own email and Lark DMs on its summon and reminder.
// Registered by the composition root (app/events.ts), never on import.
export { subscriptions } from "./lib/subscriptions";
