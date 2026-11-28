import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WORK_REQUESTS_TABLES } from "./tables";

// The tables work-requests owns are declared twice: here, for code that wants
// the list, and in entities.manifest.json, which is what the ownership ratchet
// (scripts/check-table-ownership.mjs) enforces. This pins them together, with
// the manifest as the source of truth.
describe("work-requests tables", () => {
  it("declares exactly the tables entities.manifest.json gives work-requests", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...WORK_REQUESTS_TABLES].sort()).toEqual([...(manifest.entities["work-requests"].tables ?? [])].sort());
  });
});
