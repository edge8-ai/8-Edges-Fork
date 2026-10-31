import { describe, expect, it } from "vitest";

import { collectReportingSubtree } from "@/kernel/identity/org-tree";

// root -> lead -> eng1, eng2; root -> ops; solo reports to nobody here.
const rows = [
  { id: "root", manager_id: null },
  { id: "lead", manager_id: "root" },
  { id: "ops", manager_id: "root" },
  { id: "eng1", manager_id: "lead" },
  { id: "eng2", manager_id: "lead" },
  { id: "solo", manager_id: null },
];

describe("collectReportingSubtree", () => {
  it("returns the root and everyone under it, however deep", () => {
    expect(collectReportingSubtree(rows, "root")).toEqual(["root", "lead", "ops", "eng1", "eng2"]);
  });

  it("stops at the root's own subtree", () => {
    expect(collectReportingSubtree(rows, "lead")).toEqual(["lead", "eng1", "eng2"]);
  });

  it("returns just the root for someone with no reports", () => {
    expect(collectReportingSubtree(rows, "eng1")).toEqual(["eng1"]);
  });

  it("terminates on a manager_id cycle", () => {
    const cyclic = [
      { id: "a", manager_id: "b" },
      { id: "b", manager_id: "a" },
    ];
    expect(collectReportingSubtree(cyclic, "a")).toEqual(["a", "b"]);
  });
});
