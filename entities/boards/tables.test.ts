import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARDS_TABLES } from "./tables";

// The tables boards owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) actually enforces. Two copies drift, so
// this pins them together with the manifest as the source of truth.
describe("boards tables", () => {
  it("declares exactly the tables entities.manifest.json gives boards", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...BOARDS_TABLES].sort()).toEqual([...(manifest.entities["boards"].tables ?? [])].sort());
  });

  it("names the board tables RS-01 moved off company-os", () => {
    // company-os kept the tables its own screens write; the board tables moved
    // with the module, so the entity that owns the screens owns the data.
    for (const table of ["boards", "board_columns", "tasks", "task_stage_log", "sprints", "epics"]) {
      expect(BOARDS_TABLES as readonly string[]).toContain(table);
    }
  });
});
