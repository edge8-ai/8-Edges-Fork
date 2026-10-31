import { beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The card questions boards' door answers (A.68), and the content sync's one
// command. Each row is the query a caller in another entity built by hand
// before A.68 through selectTasks or updateTasks, step for step. A column list
// wider than a caller's names the union of its callers.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  anyLiveCardOfSubject,
  boardNameOfCard,
  cardSubject,
  cardsOfSubjectsOnBoard,
  contentDayCard,
  doneCardsOfPeopleBetweenPage,
  doneCardsOfPeopleSince,
  doneCardsOfSubjectType,
  liveCardOfSubject,
  liveCardsOfSubjects,
  liveChildrenOfType,
  liveTopCardBoardsPage,
  openTopCardBoards,
  recentDoneCardsOf,
  subtasksOfSubjectsOrParents,
  topCardsOfSubjectType,
} from "./card-lookups";
import { editSyncedCard } from "./sync-edits";

beforeEach(() => resetQueries());

const LIVE: Step = ["is", "archived_at", null];
const TOP: Step = ["is", "parent_task_id", null];
const DONE: Step = ["eq", "status", "done"];

const cases: [string, () => PromiseLike<unknown>, Step[]][] = [
  // coaching backstops: archived cards included.
  ["doneCardsOfSubjectType", () => doneCardsOfSubjectType("coaching_commitment"), [["select", "id, subject_id"], ["eq", "subject_type", "coaching_commitment"], DONE]],
  // coaching pushCommitmentCard: rows of at most one, not maybeSingle.
  [
    "anyLiveCardOfSubject",
    () => anyLiveCardOfSubject("coaching_commitment", "k1"),
    [["select", "id"], ["eq", "subject_type", "coaching_commitment"], ["eq", "subject_id", "k1"], LIVE, ["limit", 1]],
  ],
  // portal openContractorCard ("id") and syncContractorCard ("id, board_id, status").
  [
    "liveCardOfSubject",
    () => liveCardOfSubject("contractor_work_request", "r1"),
    [["select", "id, board_id, status"], ["eq", "subject_type", "contractor_work_request"], ["eq", "subject_id", "r1"], LIVE, ["limit", 1], ["maybeSingle"]],
  ],
  // coaching loadCommitmentCards.
  [
    "liveCardsOfSubjects",
    () => liveCardsOfSubjects("coaching_commitment", ["k1", "k2"]),
    [["select", "subject_id, board_id, board_column_id, status"], ["eq", "subject_type", "coaching_commitment"], ["in", "subject_id", ["k1", "k2"]], LIVE],
  ],
  // portal reportCardHours.
  ["cardSubject", () => cardSubject("t1"), [["select", "subject_type, subject_id"], ["eq", "id", "t1"], ["maybeSingle"]]],
  // campaigns syncAgentCards: archived cards included.
  [
    "cardsOfSubjectsOnBoard",
    () => cardsOfSubjectsOnBoard("b1", "marketing_campaign", ["m1"]),
    [
      ["select", "id, title, due_date, status, archived_at, subject_id, description, metadata"],
      ["eq", "board_id", "b1"],
      ["eq", "subject_type", "marketing_campaign"],
      ["in", "subject_id", ["m1"]],
    ],
  ],
  // campaigns syncContentDays: every day card, archived ones included.
  [
    "topCardsOfSubjectType",
    () => topCardsOfSubjectType("b1", "marketing_day"),
    [["select", "id, title, status, archived_at, metadata"], ["eq", "board_id", "b1"], ["eq", "subject_type", "marketing_day"], TOP],
  ],
  // campaigns syncContentDays, reading back a day another pass made.
  [
    "contentDayCard",
    () => contentDayCard("b1", "marketing_day", "2026-09-24"),
    [
      ["select", "id, title, status, archived_at, metadata"],
      ["eq", "board_id", "b1"],
      ["eq", "subject_type", "marketing_day"],
      TOP,
      ["eq", "metadata->>content_day", "2026-09-24"],
      ["maybeSingle"],
    ],
  ],
  // campaigns syncContentDays: the post subtasks, by post or by day card.
  [
    "subtasksOfSubjectsOrParents (both)",
    () => subtasksOfSubjectsOrParents("b1", "marketing_content", ["a1", "a2"], ["d1"]),
    [
      ["select", "id, parent_task_id, title, status, archived_at, subject_id"],
      ["eq", "board_id", "b1"],
      ["eq", "subject_type", "marketing_content"],
      ["or", "subject_id.in.(a1,a2),parent_task_id.in.(d1)"],
    ],
  ],
  [
    "subtasksOfSubjectsOrParents (posts only)",
    () => subtasksOfSubjectsOrParents("b1", "marketing_content", ["a1"], []),
    [["select", "id, parent_task_id, title, status, archived_at, subject_id"], ["eq", "board_id", "b1"], ["eq", "subject_type", "marketing_content"], ["or", "subject_id.in.(a1)"]],
  ],
  [
    "subtasksOfSubjectsOrParents (days only)",
    () => subtasksOfSubjectsOrParents("b1", "marketing_content", [], ["d1", "d2"]),
    [
      ["select", "id, parent_task_id, title, status, archived_at, subject_id"],
      ["eq", "board_id", "b1"],
      ["eq", "subject_type", "marketing_content"],
      ["or", "parent_task_id.in.(d1,d2)"],
    ],
  ],
  // campaigns onCardLanded.
  [
    "liveChildrenOfType",
    () => liveChildrenOfType("d1", "marketing_content"),
    [["select", "id, status, subject_id"], ["eq", "parent_task_id", "d1"], ["eq", "subject_type", "marketing_content"], LIVE],
  ],
  // campaigns boardOfTask.
  ["boardNameOfCard", () => boardNameOfCard("t1"), [["select", "boards:boards!board_id(name)"], ["eq", "id", "t1"], ["maybeSingle"]]],
  // coaching getCardsCompletedSince.
  [
    "recentDoneCardsOf",
    () => recentDoneCardsOf("person-1", 50),
    [
      ["select", "id, title, status, completed_at, assignee_id"],
      ["eq", "assignee_id", "person-1"],
      DONE,
      LIVE,
      ["order", "completed_at", { ascending: false }],
      ["limit", 50],
    ],
  ],
  // coaching countCardsDone.
  [
    "doneCardsOfPeopleSince",
    () => doneCardsOfPeopleSince(["person-1"], "2026-10-01T00:00:00Z"),
    [["select", "assignee_id, completed_at"], ["in", "assignee_id", ["person-1"]], DONE, LIVE, ["gte", "completed_at", "2026-10-01T00:00:00Z"]],
  ],
  // coaching team signals, one page of a quarter range.
  [
    "doneCardsOfPeopleBetweenPage",
    () => doneCardsOfPeopleBetweenPage(["person-1"], "2025-10-01T00:00:00+07:00", "2027-01-01T00:00:00+07:00", 0, 999),
    [
      ["select", "assignee_id, completed_at"],
      ["in", "assignee_id", ["person-1"]],
      DONE,
      LIVE,
      ["gte", "completed_at", "2025-10-01T00:00:00+07:00"],
      ["lt", "completed_at", "2027-01-01T00:00:00+07:00"],
      ["order", "id"],
      ["range", 0, 999],
    ],
  ],
  // team getProgramDetail, one page of fetchAll.
  [
    "liveTopCardBoardsPage",
    () => liveTopCardBoardsPage(["b1"], 1000, 1999),
    [["select", "board_id"], ["in", "board_id", ["b1"]], LIVE, TOP, ["order", "id"], ["range", 1000, 1999]],
  ],
  // ideas innovation page.
  ["openTopCardBoards", () => openTopCardBoards(), [["select", "board_id"], ["eq", "status", "open"], LIVE, TOP]],
  // campaigns: the content sync's edits (sync-agents, sync-days, writeback), each by id.
  [
    "editSyncedCard",
    () => editSyncedCard("t1", { status: "open", completed_at: null }),
    [["update", { status: "open", completed_at: null }], ["eq", "id", "t1"]],
  ],
];

describe("card questions", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, steps) => {
    await call();
    expect(queries).toEqual([{ table: "tasks", steps }]);
  });

  it("asks nothing when there are neither posts nor day cards", async () => {
    await expect(subtasksOfSubjectsOrParents("b1", "marketing_content", [], [])).resolves.toEqual({ data: [], error: null });
    expect(queries).toEqual([]);
  });
});
