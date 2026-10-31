import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRM_TABLES } from "./tables";

// The tables crm owns are declared twice: here, for code that wants the
// list, and in entities.manifest.json, which is what the ownership ratchet
// actually enforces. Two copies drift, so this pins them together.
describe("crm tables", () => {
  it("declares exactly the tables entities.manifest.json gives crm", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../../entities.manifest.json", import.meta.url), "utf8"),
    ) as { entities: Record<string, { tables?: string[] }> };
    expect([...CRM_TABLES].sort()).toEqual([...(manifest.entities["crm"].tables ?? [])].sort());
  });
});
