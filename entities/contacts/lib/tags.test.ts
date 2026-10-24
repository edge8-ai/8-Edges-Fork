import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The tag questions and commands contacts' door answers (A.64). Each row is
// the query a caller in crm or campaigns built by hand before A.64.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { ensureTag, personTagsPage, tagIdBySlug, tagLabels, tagOptions, tagPerson, tagsOfPerson, untagPerson } from "./tags";

beforeEach(() => resetQueries());

const PERSON: Step = ["eq", "entity_type", "person"];

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // crm person tags and the audience editor: ordered for a picker.
  ["tagOptions", () => tagOptions(), "tags", [["select", "id, label"], ["order", "label"]]],
  // the audience list: a lookup, no order.
  ["tagLabels", () => tagLabels(), "tags", [["select", "id, label"]]],
  ["tagIdBySlug", () => tagIdBySlug("students"), "tags", [["select", "id"], ["eq", "slug", "students"], ["maybeSingle"]]],
  ["tagsOfPerson", () => tagsOfPerson("p1"), "taggables", [["select", "tags(id, label)"], PERSON, ["eq", "entity_id", "p1"]]],
  ["personTagsPage", () => personTagsPage(0, 999), "taggables", [["select", "entity_id, tag_id"], PERSON, ["order", "id"], ["range", 0, 999]]],
  ["ensureTag", () => ensureTag("Students", "students"), "tags", [["upsert", { label: "Students", slug: "students" }, { onConflict: "slug", ignoreDuplicates: true }]]],
  [
    "tagPerson",
    () => tagPerson("t1", "p1"),
    "taggables",
    [["upsert", { tag_id: "t1", entity_type: "person", entity_id: "p1" }, { onConflict: "tag_id,entity_type,entity_id", ignoreDuplicates: true }]],
  ],
  ["untagPerson", () => untagPerson("t1", "p1"), "taggables", [["delete"], ["eq", "tag_id", "t1"], PERSON, ["eq", "entity_id", "p1"]]],
];

describe("tag questions and commands (A.64)", () => {
  it.each(cases)("%s makes exactly the query its callers made", async (_name, run, table, steps) => {
    await run();
    expect(queries).toEqual([{ table, steps }]);
  });
});
