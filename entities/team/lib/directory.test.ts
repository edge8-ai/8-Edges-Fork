import { describe, expect, it, vi } from "vitest";

// The directory shows the name on record (S.14: legalName). What this pins is
// the one thing that choice could quietly change: a member with no name at all
// keeps the directory's own placeholder, "—", rather than the kernel's
// "Unnamed", which nothing else on the team screens uses.

const rows = [
  { id: "tm-1", work_location: null, manager_id: null, people: { full_name: "Nguyễn Văn Hiếu", preferred_name: "Harry", avatar_url: null }, departments: null, positions: null },
  { id: "tm-2", work_location: null, manager_id: "tm-1", people: { full_name: null, preferred_name: null, avatar_url: null }, departments: null, positions: null },
];
vi.mock("@/kernel/data/supabase", () => ({
  companyOs: { from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }) },
  companyOsUntyped: {},
}));

const { getDirectory } = await import("./data");

describe("getDirectory", () => {
  it("shows the name on record, and the directory's placeholder for a member with none", async () => {
    const entries = await getDirectory();
    // Sorted by name, and "—" sorts first.
    expect(entries.map((e) => [e.name, e.managerName])).toEqual([
      ["—", "Nguyễn Văn Hiếu"],
      ["Nguyễn Văn Hiếu", null],
    ]);
  });
});
