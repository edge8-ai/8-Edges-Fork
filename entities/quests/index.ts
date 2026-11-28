// The quests entity's server door (QS.1, spec 2026-10-20; ADR 0019): the
// Bounties, Raids and Beacons people take on to live the company's values of
// learning and sharing. It exports the Asks page's reads and server actions,
// what Ladders counts, and what the team assistant's quest tools read (QS.9).
// The Quests page's game (the boss, Campfires, Lighthouses, the Lore, Evolve)
// was retired with AK.4 (ADR 0036); its rows stay.
export { readParty } from "./lib/quests-read";
export type { Portrait } from "./lib/quests-read";
export { closeQuest, reactToTurnIn, summonBounty, turnIn, withdrawQuest } from "./lib/quest-actions";
export type { SummonBountyInput } from "./lib/quest-actions";
// Asks (AK.2, ADR 0036): the plain page's one read, the three lists, and the
// sidebar's count of what waits on the reader, which app/shell.ts hands the
// team layout as the asksNavCounts slot (slots.ts).
export { readAsksPage } from "./lib/asks-read";
export { asksNavCounts } from "./lib/asks-count";
// For a register mark (LD.2): who hosts the Raid behind a Training session.
export { raidHostsOf } from "./lib/acts";
// What a person did on Quests, for the ladders' points and badges alike (LD.7,
// A.76): the person's accepted and turned-in party rows with their quests, the
// quests they gave, the Raids they host with each one judged held or not here
// (ADR 0023), and the Reactions on those Turn-ins. Never a row that was handed
// back or missed.
export { questFactsOf } from "./lib/act-facts";
export type { HostedRaid, PartyFact, QuestFact, QuestFacts, ReactionFact } from "./lib/act-facts";
// The team assistant (QS.9): what is open for the reader, theirs alone, and a
// Bounty drafted from an instruction, which writes nothing and returns a link
// that opens the New ask drawer with it filled in.
export { readOpenQuests } from "./lib/open-quests";
export type { OpenBounty, OpenFire, OpenHead, OpenQuests } from "./lib/open-quests";
export { draftBounty } from "./lib/bounty-draft-read";
export type { DraftOutcome } from "./lib/bounty-draft";
// And the manager's one question: who among the people they reach missed one
// named Bounty, through the report's own read and reach (QS.3).
export { askQuestReport } from "./lib/report-question";
export type { ReportAnswer, ReportQuestion } from "./lib/report-question";
// The bus (QS.5c): a Raid whose Training session is cancelled goes out. And
// QS.2: Quests' own Lark DMs on its summon and reminder (AK.5).
// Registered by the composition root (app/events.ts), never on import.
export { subscriptions } from "./lib/subscriptions";
