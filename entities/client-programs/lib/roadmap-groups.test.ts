import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The roadmap section and overview questions client-programs' door answers
// (A.66), and the program document read and write beside them. Each row is the
// query a caller in another entity built by hand before A.66, step for step.

vi.mock("@/kernel/data/supabase", () => ({ supabase: {}, companyOs: { from: recordingFrom } }));

import { ROADMAP_GROUPS_SELECT as GROUP } from "./client-backlog";
import { liveRoadmapGroup, roadmapGroupRanks, roadmapGroupsOfCompanies, roadmapGroupsOfCompany, roadmapOverview } from "./roadmap-groups";
import { addProgramDocument, documentsOfPrograms } from "./client-documents";

beforeEach(() => resetQueries());

const LIVE: Step = ["is", "archived_at", null];
const ASC = { ascending: true };

const cases: [string, () => Promise<unknown>, string, Step[]][] = [
  // crm company page, team program page, team getProgramDetail (ROADMAP_GROUPS_SELECT), and boards
  // getWorkboard ("key, step_label, title, sort_order", ordered by sort_order with
  // the default direction, which is ascending: the same request).
  [
    "roadmapGroupsOfCompany",
    () => roadmapGroupsOfCompany("c1"),
    "client_roadmap_groups",
    [["select", GROUP], ["eq", "company_id", "c1"], LIVE, ["order", "sort_order", ASC]],
  ],
  // portal getGroupsForActor (portalRead's `in` on the actor's companyScope) and team groupsForCompanies.
  [
    "roadmapGroupsOfCompanies",
    () => roadmapGroupsOfCompanies(["c1", "c2"]),
    "client_roadmap_groups",
    [["select", GROUP], ["in", "company_id", ["c1", "c2"]], LIVE, ["order", "sort_order", ASC]],
  ],
  // team getClientDigests.
  ["roadmapGroupRanks", () => roadmapGroupRanks(["c1"]), "client_roadmap_groups", [["select", "company_id, key, sort_order"], ["in", "company_id", ["c1"]], LIVE]],
  // portal proposeItemForActor and team groupExists.
  [
    "liveRoadmapGroup",
    () => liveRoadmapGroup("c1", "build"),
    "client_roadmap_groups",
    [["select", "id"], ["eq", "company_id", "c1"], ["eq", "key", "build"], LIVE, ["maybeSingle"]],
  ],
  // crm company and program pages, team getClientRoadmapForActor and program page.
  ["roadmapOverview", () => roadmapOverview("c1"), "client_roadmap_overview", [["select", "body"], ["eq", "company_id", "c1"], ["maybeSingle"]]],
  // portal listProgramsForActor.
  [
    "documentsOfPrograms",
    () => documentsOfPrograms(["p1"]),
    "program_documents",
    [["select", "id, ai_program_id, filename, size_bytes, uploaded_by, created_at"], ["in", "ai_program_id", ["p1"]], ["order", "created_at", ASC]],
  ],
  // portal recordProgramDocument.
  [
    "addProgramDocument",
    () => addProgramDocument({ companyId: "c1", programId: "p1", path: "company/c1/program/p1/x-a.pdf", filename: "a.pdf", sizeBytes: 10, uploadedBy: "a@example.test" }),
    "program_documents",
    [
      [
        "insert",
        { company_id: "c1", ai_program_id: "p1", storage_path: "company/c1/program/p1/x-a.pdf", filename: "a.pdf", size_bytes: 10, uploaded_by: "a@example.test" },
      ],
    ],
  ],
];

describe("roadmap section, overview and program document questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
