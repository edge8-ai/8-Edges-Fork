import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// W.184 (2026-10-08). The board picker on a spark offered an admin every
// active board, thirty client boards first, with a client's preselected; the
// card it made then sat in no sprint. pickableBoards now lists the person's own
// boards with their main one first, each with the sprint a new card joins.

let memberIds: string[] = [];
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("./access", () => ({ memberBoardIds: vi.fn(async () => memberIds) }));
vi.mock("@/kernel/config/dates", () => ({ saigonToday: () => "2026-10-08" }));

import { cardsForIdeas, currentSprintFor, pickableBoards } from "./idea-cards";

const admin = { personId: "p1", teamMemberId: "tm1", isAdmin: true };
const member = { ...admin, isAdmin: false };

beforeEach(() => {
  resetFake();
  memberIds = [];
});

describe("currentSprintFor", () => {
  const sp = (id: string, starts_on: string, ends_on: string) => ({ id, board_id: "b", starts_on, ends_on });

  it("picks the active sprint that holds today over the one being planned", () => {
    expect(currentSprintFor([sp("next", "2026-10-14", "2026-10-20"), sp("now", "2026-10-07", "2026-10-13")], "2026-10-08")).toBe("now");
  });

  it("falls back to the first active sprint, and to none on a board without one", () => {
    expect(currentSprintFor([sp("next", "2026-10-14", "2026-10-20")], "2026-10-08")).toBe("next");
    expect(currentSprintFor([], "2026-10-08")).toBeNull();
  });
});

describe("pickableBoards", () => {
  function scriptBoards() {
    script("boards", {
      data: [
        { id: "client", slug: "client", name: "A client" },
        { id: "ours", slug: "ours", name: "Our board" },
      ],
    });
    script("board_columns", { data: [{ id: "c-client", board_id: "client" }, { id: "c-ours", board_id: "ours" }] });
    script("sprints", { data: [{ id: "sp6", board_id: "ours", starts_on: "2026-10-07", ends_on: "2026-10-13" }] });
    script("tasks", { data: [{ board_id: "ours" }, { board_id: "ours" }, { board_id: "client" }] });
  }

  it("puts the board where the person holds the most open cards first, with its sprint", async () => {
    memberIds = ["client", "ours"];
    scriptBoards();
    expect(await pickableBoards(admin)).toEqual([
      { id: "ours", slug: "ours", name: "Our board", columnId: "c-ours", sprintId: "sp6" },
      { id: "client", slug: "client", name: "A client", columnId: "c-client", sprintId: null },
    ]);
  });

  it("offers a member on no board nothing, and an admin on no board every active board", async () => {
    expect(await pickableBoards(member)).toEqual([]);
    scriptBoards();
    expect((await pickableBoards(admin)).map((b) => b.id)).toEqual(["ours", "client"]);
  });
});

// W.186: the spark page names who has the card and where it sits.
describe("cardsForIdeas", () => {
  it("carries the board and column names with the person who has the card", async () => {
    script("tasks", {
      data: [
        {
          id: "t1",
          title: "Show who created a card",
          status: "open",
          assignee_id: "p1",
          metadata: { idea_id: "s1" },
          created_at: "2026-10-08T01:00:00Z",
          completed_at: null,
          boards: { slug: "ours", name: "Our board" },
          board_columns: { name: "Doing" },
          people: { display_name: "Rowan Hale", preferred_name: null, full_name: null },
        },
      ],
    });
    expect(await cardsForIdeas(["s1"])).toEqual([
      expect.objectContaining({ ideaId: "s1", taskId: "t1", boardSlug: "ours", boardName: "Our board", columnName: "Doing", assigneeName: "Rowan Hale" }),
    ]);
  });
});
