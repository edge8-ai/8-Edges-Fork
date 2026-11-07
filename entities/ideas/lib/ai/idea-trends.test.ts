import { describe, expect, it, vi } from "vitest";

// The material and the ref mapping are pure; the client is never built here.
vi.mock("@/kernel/data/supabase", () => ({ companyOs: {} }));

import { fromRefs, materialLine } from "./idea-trends";

describe("materialLine (W.189)", () => {
  it("names the spark and its author by ref, never by id or name", () => {
    const row = { id: "uuid-1", kind: "learning", person_id: "person-uuid", title: "Fix the process first", office: "operations", takeaway: "Then decide what the AI does.", problem: null };
    expect(materialLine("s3", "p2", row)).toBe("- s3 by p2 [learning, operations] Fix the process first — Then decide what the AI does.");
  });
});

describe("fromRefs (W.189)", () => {
  it("maps refs back to ids and drops refs the model was not given", () => {
    const idOf = new Map([
      ["s1", "id-1"],
      ["s2", "id-2"],
    ]);
    const [t] = fromRefs(
      [{ kind: "build", title: "T", gist: "G", ideaIds: ["s1", " s2 ", "s9"], relatedIds: ["s9"], repeats: [{ ideaIds: ["s1", "s2"], label: "Same ask" }] }],
      idOf,
    );
    expect(t.ideaIds).toEqual(["id-1", "id-2"]);
    expect(t.relatedIds).toEqual([]);
    expect(t.repeats).toEqual([{ ideaIds: ["id-1", "id-2"], label: "Same ask" }]);
  });
});
