import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The client_backlog_items questions and commands client-programs' door
// answers (A.66). Each row is the query a caller in another entity built by
// hand before A.66, step for step. The portal and the team hub render these
// rows, so the scope step (`eq`/`in` on company_id) and the live step
// (`archived_at is null`) are the ones to read first.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import { BACKLOG_SELECT as ITEM } from "./client-backlog";
import {
  addRoadmapItem,
  backlogActivitySince,
  backlogItemCompany,
  backlogItemInCompany,
  backlogItemTitles,
  editRoadmapItem,
  liveBacklogFactsPage,
  liveBacklogItemRefs,
  plannedTokensOfCompanies,
  programRoadmapItems,
  roadmapItemsOfCompanies,
  roadmapItemsOfCompany,
  roadmapItemsPage,
  setClientPriority,
  setClientSortOrder,
} from "./roadmap-items";

beforeEach(() => resetQueries());

const LIVE: Step = ["is", "archived_at", null];
const ASC = { ascending: true };
const AT = "2026-10-18T03:00:00.000Z";

const cases: [string, () => Promise<unknown>, Step[]][] = [
  // boards setCardBacklogItem.
  ["backlogItemInCompany", () => backlogItemInCompany("i1", "c1"), [["select", "id"], ["eq", "id", "i1"], ["eq", "company_id", "c1"], ["maybeSingle"]]],
  // team updateRoadmapItemForActor.
  ["backlogItemCompany", () => backlogItemCompany("i1"), [["select", "id, company_id"], ["eq", "id", "i1"], ["maybeSingle"]]],
  // boards getWorkboard: card subject labels, and one client's roadmap picker.
  ["backlogItemTitles", () => backlogItemTitles(["i1"]), [["select", "id, title"], ["in", "id", ["i1"]]]],
  ["liveBacklogItemRefs", () => liveBacklogItemRefs("c1"), [["select", "id, title, group_key"], ["eq", "company_id", "c1"], LIVE, ["order", "sort_order"]]],
  // crm account health: the caller passed `since.slice(0, 10)` into the or-group itself.
  [
    "backlogActivitySince",
    () => backlogActivitySince(["c1", "c2"], "2026-09-18T03:00:00.000Z"),
    [["select", "company_id, updated_at, archived_at"], ["in", "company_id", ["c1", "c2"]], ["or", "archived_at.is.null,updated_at.gte.2026-09-18"]],
  ],
  // team getClientRoadmapForActor (BACKLOG_SELECT).
  ["roadmapItemsOfCompany", () => roadmapItemsOfCompany("c1"), [["select", ITEM], ["eq", "company_id", "c1"], LIVE]],
  // portal getBacklogForActor (portalRead's `in` on the actor's companyScope, BACKLOG_SELECT);
  // team getClientRoadmapSnippets and getClientDigests (each a subset of BACKLOG_SELECT).
  ["roadmapItemsOfCompanies", () => roadmapItemsOfCompanies(["c1", "c2"]), [["select", ITEM], ["in", "company_id", ["c1", "c2"]], LIVE]],
  // crm company page, one page of the paginated read.
  [
    "roadmapItemsPage",
    () => roadmapItemsPage("c1", 0, 999),
    [["select", ITEM], ["eq", "company_id", "c1"], LIVE, ["order", "sort_order", ASC], ["order", "id"], ["range", 0, 999]],
  ],
  // team getProgramDetail.
  [
    "programRoadmapItems",
    () => programRoadmapItems("c1", "p1"),
    [["select", ITEM], ["eq", "company_id", "c1"], ["eq", "ai_program_id", "p1"], LIVE, ["order", "sort_order", ASC]],
  ],
  // portal getTokenUsageForCompanies.
  ["plannedTokensOfCompanies", () => plannedTokensOfCompanies(["c1"]), [["select", "token_high"], ["in", "company_id", ["c1"]], LIVE]],
  // team getHubTabFlags ("ai_program_id"), getHubOverviewForActor ("token_high") and
  // fetchProgramSummaryInputs ("ai_program_id, status"): one page, their union.
  [
    "liveBacklogFactsPage",
    () => liveBacklogFactsPage("c1", 1000, 1999),
    [["select", "ai_program_id, status, token_high"], ["eq", "company_id", "c1"], LIVE, ["order", "id"], ["range", 1000, 1999]],
  ],
  // portal proposeItemForActor.
  [
    "addRoadmapItem",
    () => addRoadmapItem({ company_id: "c1", group_key: "g", title: "T", source: "client", status: "proposed", sort_order: 999 }),
    [["insert", { company_id: "c1", group_key: "g", title: "T", source: "client", status: "proposed", sort_order: 999 }], ["select", "id"], ["single"]],
  ],
  // team updateRoadmapItemForActor.
  ["editRoadmapItem", () => editRoadmapItem("i1", { title: "T", updated_at: AT }), [["update", { title: "T", updated_at: AT }], ["eq", "id", "i1"]]],
  // portal reorderGroupForActor and setClientPriorityForActor.
  ["setClientSortOrder", () => setClientSortOrder("i1", 20, AT), [["update", { client_sort_order: 20, updated_at: AT }], ["eq", "id", "i1"]]],
  ["setClientPriority", () => setClientPriority("i1", null, AT), [["update", { client_priority: null, updated_at: AT }], ["eq", "id", "i1"]]],
];

describe("client_backlog_items questions and commands", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "client_backlog_items", steps }]);
  });
});
