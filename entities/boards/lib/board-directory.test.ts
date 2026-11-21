import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The board, column and owner questions boards' door answers (A.68). Each row
// is the query a caller in another entity built by hand before A.68 through
// selectBoards, selectBoardColumns or selectBoardMembers, step for step. A
// column list wider than a caller's names the union of its callers.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  activeBoard,
  activeBoardsAmong,
  activeBoardsWithMetadata,
  boardIdsOfMember,
  boardOfSlug,
  boardOwner,
  boardsByIds,
  columnNames,
  columnsOfBoard,
  firstOpenColumn,
  liveBoardProgramTags,
  liveBoardProgramTagsPage,
  liveBoardsOfCompanies,
  liveBoardsOfCompany,
  liveBoardsOfProgram,
  unarchivedBoards,
} from "./board-directory";

beforeEach(() => resetQueries());

const ACTIVE: Step = ["eq", "status", "active"];
const UNARCHIVED: Step = ["is", "archived_at", null];
const ASC = { ascending: true };

const cases: [string, () => PromiseLike<unknown>, string, Step[]][] = [
  // campaigns loadContentBoard.
  [
    "activeBoardsWithMetadata",
    () => activeBoardsWithMetadata(),
    "boards",
    [["select", "id, slug, metadata, sort_order"], ACTIVE, UNARCHIVED, ["order", "sort_order"]],
  ],
  // campaigns writeback boardBySlug ("name") and portal openContractorCard ("id").
  ["boardOfSlug", () => boardOfSlug("contractors"), "boards", [["select", "id, name"], ["eq", "slug", "contractors"], ["maybeSingle"]]],
  // coaching boardFor (an admin coach's pick).
  ["activeBoard", () => activeBoard("b1"), "boards", [["select", "id, slug, name"], ["eq", "id", "b1"], ACTIVE, UNARCHIVED, ["maybeSingle"]]],
  // coaching coachBoards.
  [
    "activeBoardsAmong",
    () => activeBoardsAmong(["b1", "b2"]),
    "boards",
    [["select", "id, slug, name"], ["in", "id", ["b1", "b2"]], ACTIVE, UNARCHIVED, ["order", "sort_order"]],
  ],
  // coaching loadCommitmentCards: no status filter, an archived board still names its card.
  ["boardsByIds", () => boardsByIds(["b1"]), "boards", [["select", "id, slug, name"], ["in", "id", ["b1"]]]],
  // crm company page ("id, slug, ai_program_id"; name added for the union with the portal's).
  [
    "liveBoardsOfCompany",
    () => liveBoardsOfCompany("c1"),
    "boards",
    [["select", "id, name, slug, ai_program_id"], ["eq", "client_company_id", "c1"], ACTIVE, UNARCHIVED, ["order", "sort_order", ASC]],
  ],
  // portal listHubBoardsForActor: the actor's companyScope, as an `in`, and nothing wider.
  [
    "liveBoardsOfCompanies",
    () => liveBoardsOfCompanies(["c1", "c2"]),
    "boards",
    [["select", "id, name, slug, ai_program_id"], ["in", "client_company_id", ["c1", "c2"]], ACTIVE, UNARCHIVED, ["order", "sort_order", ASC]],
  ],
  // team getHubTabFlags: unordered, unpaged.
  ["liveBoardProgramTags", () => liveBoardProgramTags("c1"), "boards", [["select", "ai_program_id"], ["eq", "client_company_id", "c1"], ACTIVE, UNARCHIVED]],
  // team fetchProgramSummaryInputs, one page of fetchAll.
  [
    "liveBoardProgramTagsPage",
    () => liveBoardProgramTagsPage("c1", 0, 999),
    "boards",
    [["select", "ai_program_id"], ["eq", "client_company_id", "c1"], ACTIVE, UNARCHIVED, ["order", "id"], ["range", 0, 999]],
  ],
  // team getProgramDetail.
  [
    "liveBoardsOfProgram",
    () => liveBoardsOfProgram("c1", "p1"),
    "boards",
    [["select", "id, name, slug"], ["eq", "client_company_id", "c1"], ["eq", "ai_program_id", "p1"], ACTIVE, UNARCHIVED, ["order", "sort_order", ASC]],
  ],
  // ideas innovation page: archived boards out, any status in.
  ["unarchivedBoards", () => unarchivedBoards(), "boards", [["select", "id, name, client_company_id"], UNARCHIVED]],
  // campaigns loadContentBoard, and portal open/syncContractorCard ("id, is_done, is_not_doing, position").
  [
    "columnsOfBoard",
    () => columnsOfBoard("b1"),
    "board_columns",
    [["select", "id, name, position, is_done, is_not_doing"], ["eq", "board_id", "b1"], ["order", "position"]],
  ],
  // coaching boardFor, and boards' own repeat successor (land-card.ts).
  [
    "firstOpenColumn",
    () => firstOpenColumn("b1"),
    "board_columns",
    [["select", "id"], ["eq", "board_id", "b1"], ["eq", "is_done", false], ["eq", "is_not_doing", false], ["order", "position"], ["limit", 1], ["maybeSingle"]],
  ],
  // coaching loadCommitmentCards.
  ["columnNames", () => columnNames(["k1"]), "board_columns", [["select", "id, name"], ["in", "id", ["k1"]]]],
  // campaigns loadContentBoard: rows, at most one, not maybeSingle.
  ["boardOwner", () => boardOwner("b1"), "board_members", [["select", "person_id"], ["eq", "board_id", "b1"], ["eq", "role", "owner"], ["limit", 1]]],
  // coaching coachBoards.
  ["boardIdsOfMember", () => boardIdsOfMember("person-1"), "board_members", [["select", "board_id"], ["eq", "person_id", "person-1"]]],
];

describe("board, column and owner questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
