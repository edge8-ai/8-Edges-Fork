// The ideas entity's server door. Ideas, the issues raised against them, their trend reports and the agent sync packets.
//
// Its screens still live where they were and move here in a later slice; what
// moved first is ownership of the tables and the writers that touch them,
// because an entity that owns its data is the unit a deployment installs.
// The questions other entities ask about sparks, issues and theme reports, and
// the scoped spark edit team's /team ideas pages make (A.70, A.88.6, ADR 0018). The raw builders in
// lib/reads.ts and lib/writes.ts are private to this entity.
export * from "./lib/idea-lookups";
export { editIdeaInScope } from "./lib/idea-edits";
// The ideas module itself, moved out of company-os with its screens.
export * from "./lib/ideas";
export * from "./lib/ai/idea-trends";
export * from "./lib/ai/idea-plan";
// What comes back on a spark: reactions, builds, the deck (ID.2.6, ID.2.7).
export * from "./lib/spark-social";
export * from "./lib/spark-store";
// What the team keeps raising: the themes across the sparks (W.189).
export * from "./lib/themes";
export * from "./lib/theme-report";
// The Monday Innovation section of the Operations morning list (Lark notifications plan).
export { innovationWeeklySections } from "./lib/innovation-weekly";
// The bus subscriber the composition root registers (W.192).
export { subscriptions } from "./lib/subscriptions";
// The ladders' one question of Spark (LD.1, LD.7; ADR 0021, A.77): the
// person's sparks, as posted, for the points and the badges, and the marks
// and build notes they gave and the "it held" others gave them. Never a skip.
export { sparkFactsOf } from "./lib/act-facts";
export type { BuildNoteFact, HeldFact, MarkFact, SparkFact, SparkFacts } from "./lib/act-facts";
