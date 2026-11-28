import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The spark, issue and theme-report questions ideas' door answers, and team's
// one edit of a spark (A.70). Each row is the query a caller in another entity
// built by hand before A.70 through selectIdeas, selectIssues,
// selectIdeaTrendReports or updateIdeas, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { assistantSparks, liveSparkKinds, openIssues, recentThemeReports, sharedSpark, sharedSparks, sparkAuthorsSince } from "./idea-lookups";
import { editIdea } from "./idea-edits";

beforeEach(() => resetQueries());

const SHARED: Step = [
  "select",
  "id, kind, person_id, title, problem, data_needed, workflow, roi, story, takeaway, source_urls, office, ai_plan, ai_error, status, created_at, people:people!person_id(display_name, preferred_name, full_name, email)",
];
const ASSISTANT: Step = ["select", "title, kind, office, status, created_at, person_id, problem, roi, story, takeaway, ai_plan"];
const NEWEST: Step = ["order", "created_at", { ascending: false }];
const NOT_ARCHIVED: Step = ["neq", "status", "archived"];

const cases: [string, () => PromiseLike<unknown>, string, Step[]][] = [
  // team getSharedIdeas.
  ["sharedSparks", () => sharedSparks(), "ideas", [SHARED, NOT_ARCHIVED, NEWEST, ["limit", 200]]],
  // team getSharedIdea: archived or not, team decides.
  ["sharedSpark", () => sharedSpark("i1"), "ideas", [SHARED, ["eq", "id", "i1"], ["maybeSingle"]]],
  // team assistant listIdeas: no kind, no search ...
  ["assistantSparks", () => assistantSparks(null, ""), "ideas", [ASSISTANT, NEWEST, ["limit", 30]]],
  // ... one kind and a search.
  [
    "assistantSparks, a kind and a search",
    () => assistantSparks("build", "a_b"),
    "ideas",
    [ASSISTANT, ["eq", "kind", "build"], ["ilike", "title", "%a\\_b%"], NEWEST, ["limit", 30]],
  ],
  // team individual summary.
  ["sparkAuthorsSince", () => sparkAuthorsSince("2026-10-19T00:00:00Z"), "ideas", [["select", "person_id, created_at"], ["gte", "created_at", "2026-10-19T00:00:00Z"], NOT_ARCHIVED]],
  // company-os admin dashboard.
  ["liveSparkKinds", () => liveSparkKinds(), "ideas", [["select", "kind, created_at"], NOT_ARCHIVED, ["limit", 1000]]],
  // org office goals.
  ["openIssues", () => openIssues(), "issues", [["select", "key_result_id, status"], ["in", "status", ["open", "solving"]]]],
  // crm market metrics.
  [
    "recentThemeReports",
    () => recentThemeReports(),
    "idea_trend_reports",
    [["select", "themes, source_count, generated_at"], ["order", "generated_at", { ascending: false }], ["limit", 12]],
  ],
  // team updateInScope("ideas", ...).
  ["editIdea", () => editIdea("i1", { status: "archived" }), "ideas", [["update", { status: "archived" }], ["eq", "id", "i1"]]],
];

describe("spark, issue and theme-report questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
