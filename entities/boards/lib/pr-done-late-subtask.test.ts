import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// Z.22, end to end down to the landing: the case that left a client card in
// Doing for eleven days. The merge sync passes a card by because one subtask
// is still open; the subtask closes the next day and the sync never names the
// PR again; the daily routine then lands the card in Done through
// landCardAsSystem, whose move row reads "Moved by GitHub: PR #271 merged".
// landCard is faked here (land-card.test.ts proves it writes the stage-log row
// from logNote); system-moves is real, so what is pinned is the whole
// hand-over from the stamp to that row.

vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const landCard = vi.fn(async (_landing: unknown) => ({ ok: true as const }));
vi.mock("./land-card", () => ({ landCard: (landing: unknown) => landCard(landing) }));

const { landCardsForMergedPullRequests, landCardsWithMergedStamps } = await import("./pr-done");

const PR = "https://github.com/example-org/client-app/pull/271";
const KEY = "example-org/client-app#271";
const card = (metadata: Record<string, unknown>) => ({ id: "card-1", board_id: "board-1", metadata });

beforeEach(() => {
  resetFake();
  landCard.mockClear();
});

describe("a card whose last subtask closes after its PR merged (Z.22)", () => {
  it("is passed by on the merge night and landed in Done by the daily routine once the subtask closes", async () => {
    // The merge night: the card links the PR, and its last subtask is still open.
    script("tasks", { data: [card({ pr_url: PR })] }, { data: [{ parent_task_id: "card-1" }] });
    script("board_columns", { data: [{ id: "col-done", board_id: "board-1", position: 4 }] });
    await landCardsForMergedPullRequests({ pullRequests: [{ url: PR, number: 271, title: "Scheduled sync", state: "merged" }] });
    expect(landCard).not.toHaveBeenCalled();

    // A later morning: the stamp says merged, no subtask is open, and the sync
    // has not named PR #271 since.
    const stamped = { pr_url: PR, pr_synced: { key: KEY, title: "Scheduled sync", state: "merged" } };
    script(
      "tasks",
      { data: [card(stamped)] }, // the open cards with a merged stamp
      { data: [] }, // their open children: none
      { data: { id: "card-1", board_id: "board-1", board_column_id: "col-doing", subject_type: null, subject_id: null, boards: { slug: "client-delivery" } } },
    );
    script(
      "board_columns",
      { data: [{ id: "col-done", board_id: "board-1", position: 4 }] },
      { data: { id: "col-done", is_done: true, is_not_doing: false } },
    );
    expect(await landCardsWithMergedStamps()).toEqual({ landed: 1, waiting: 0, failed: [] });

    expect(landCard).toHaveBeenCalledTimes(1);
    expect(landCard).toHaveBeenCalledWith({
      taskId: "card-1",
      actor: { label: "GitHub: PR #271 merged", personId: null, isAdmin: true },
      from: { boardId: "board-1", columnId: "col-doing" },
      to: { boardId: "board-1", boardSlug: "client-delivery", columnId: "col-done", isDone: true, isNotDoing: false },
      subject: { type: null, id: null },
      also: { metadata: { ...stamped, pr_done: KEY } },
      logNote: "Moved by GitHub: PR #271 merged",
      refreshSlugs: ["client-delivery"],
    });
  });
});
