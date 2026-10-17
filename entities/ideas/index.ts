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
// What the team keeps raising: the themes across the sparks (W.189).
export * from "./lib/themes";
export * from "./lib/theme-report";
// The bus subscriber the composition root registers (W.192).
export { subscriptions } from "./lib/subscriptions";
