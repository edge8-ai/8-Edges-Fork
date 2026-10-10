import { describe, expect, it } from "vitest";
import { allWorkflows } from "../entities/library/lib/workflowsData.ts";
import { loadAgentManagement } from "../entities/company-os/lib/agent-management.ts";

// The public workflows directory tags each workflow built or planned, and a
// built workflow names the Settings → Agents routines that run it. This keeps
// the two lists honest in both directions: every routine on the Agents page is
// documented at edge8.ai/workflows, and no workflow claims a routine that does
// not exist. It lives in scripts/ because the library entity is internal and
// company-os is portable, so neither may import the other for a test.
describe("workflows directory mirrors Settings → Agents", () => {
  const routineIds = new Set(loadAgentManagement().routines.map((r) => r.id));
  const claimed = new Set(allWorkflows.flatMap((w) => w.routines ?? []));

  it("documents every routine on the Agents page", () => {
    const undocumented = [...routineIds].filter((id) => !claimed.has(id));
    expect(undocumented).toEqual([]);
  });

  it("names only routines that exist", () => {
    const phantom = [...claimed].filter((id) => !routineIds.has(id));
    expect(phantom).toEqual([]);
  });

  it("tags a workflow built exactly when a routine runs it", () => {
    const mismatched = allWorkflows
      .filter((w) => (w.status === "built") !== (w.routines?.length ?? 0) > 0)
      .map((w) => w.slug);
    expect(mismatched).toEqual([]);
  });
});
