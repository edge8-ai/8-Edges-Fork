import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_TABLES } from "./tables";

// The tables notifications owns are declared twice: here, for code that wants
// the list, and in entities.manifest.json, which is what the ownership ratchet
// actually enforces. Two copies drift, so this pins them together.
describe("notifications tables", () => {
  it("declares exactly the tables entities.manifest.json gives notifications", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...NOTIFICATIONS_TABLES].sort()).toEqual([...(manifest.entities["notifications"].tables ?? [])].sort());
  });
});
