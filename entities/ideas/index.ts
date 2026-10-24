// The ideas entity's server door. Ideas, the issues raised against them, their trend reports and the agent sync packets.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
export * from "./lib/reads";
export * from "./lib/writes";
// The ideas module itself, moved out of company-os with its screens.
export * from "./lib/ideas";
export * from "./lib/ai/idea-trends";
export * from "./lib/ai/idea-plan";
// What comes back on a spark: reactions, builds, the deck (ID.2.6, ID.2.7).
export * from "./lib/spark-social";
export * from "./lib/spark-store";
// The learnings as the Quests page's Lore reads and answers them (QS.4): the
// newest with will-try counts, a learning from one line, and Will try; and the
// season banner's company count of learnings (QS.14).
export { countLearningsSince, postLearning, readLearnings, sayWillTry } from "./lib/learnings";
export type { Learning } from "./lib/learnings";
// What the team keeps raising: the themes across the sparks (W.189).
export * from "./lib/themes";
export * from "./lib/theme-report";
// The bus subscriber the composition root registers (W.192).
export { subscriptions } from "./lib/subscriptions";
// One question for the ladders (LD.1; ADR 0021): a person's sparks, as posted.
export { sparksOf } from "./lib/acts";
export type { SparkAct } from "./lib/acts";
// And for the badges found by doing (LD.7): the person's sparks, the marks and
// build notes they gave, and the "it held" others gave them. Never a skip.
export { sparkFactsOf } from "./lib/act-facts";
export type { BuildNoteFact, HeldFact, MarkFact, SparkFact, SparkFacts } from "./lib/act-facts";
