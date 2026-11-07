import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QUESTS_TABLES } from "./tables";

// The tables quests owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// actually enforces. Two copies drift, so this pins them together.
describe("quests tables", () => {
  it("declares exactly the tables entities.manifest.json gives quests", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...QUESTS_TABLES].sort()).toEqual([...(manifest.entities["quests"].tables ?? [])].sort());
  });

  it("owns the quest, its party, its Reactions, a Bounty's heads and the raised hands", () => {
    expect([...QUESTS_TABLES].sort()).toEqual(["quest_hands", "quest_heads", "quest_party", "quest_reactions", "quests"]);
  });
});
