import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLIENT_PROGRAMS_TABLES } from "./tables";

// The tables client-programs owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) actually enforces. Two copies drift, so
// this pins them together with the manifest as the source of truth.
describe("client-programs tables", () => {
  it("declares exactly the tables entities.manifest.json gives client-programs", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...CLIENT_PROGRAMS_TABLES].sort()).toEqual([...(manifest.entities["client-programs"].tables ?? [])].sort());
  });

  it("names the programme tables RS-02 moved off portal", () => {
    // A programme is what boards, the admin roadmap screens and the client
    // portal all hang work off, so it sits below all three.
    for (const table of ["ai_programs", "client_backlog_items", "client_roadmap_groups", "client_roadmap_overview"]) {
      expect(CLIENT_PROGRAMS_TABLES as readonly string[]).toContain(table);
    }
  });
});
