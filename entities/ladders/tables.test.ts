import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LADDERS_TABLES } from "./tables";

// The tables ladders owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// actually enforces. Two copies drift, so this pins them together.
describe("ladders tables", () => {
  it("declares exactly the tables entities.manifest.json gives ladders", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...LADDERS_TABLES].sort()).toEqual([...(manifest.entities["ladders"].tables ?? [])].sort());
  });

  it("owns the cache, the unlocks and the person's choices, and nothing of the acts it counts", () => {
    expect([...LADDERS_TABLES].sort()).toEqual(["ladder_display", "ladder_positions", "ladder_unlocks"]);
  });
});
