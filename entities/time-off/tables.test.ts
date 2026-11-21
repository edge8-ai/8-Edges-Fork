import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIME_OFF_TABLES } from "./tables";

// The tables time-off owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) actually enforces. Two copies drift, so
// this pins them together with the manifest as the source of truth.
describe("time-off tables", () => {
  it("declares exactly the tables entities.manifest.json gives time-off", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...TIME_OFF_TABLES].sort()).toEqual([...(manifest.entities["time-off"].tables ?? [])].sort());
  });

  it("names the leave tables FS-03 moved off team", () => {
    // team kept the tables its own screens write; the leave tables moved with
    // the code, so the entity that owns the screens owns the data.
    for (const table of ["leave_adjustments", "leave_policies", "time_off"]) {
      expect(TIME_OFF_TABLES as readonly string[]).toContain(table);
    }
  });
});
