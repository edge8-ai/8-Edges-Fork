import { beforeEach, describe, expect, it, vi } from "vitest";

// Z.16: a merged PR lands the open card that links it in its board's Done
// column, through the same landing as a drag. The landing itself is
// system-moves' and land-card's to prove; this proves which cards are landed
// and which are left alone.

type Card = { id: string; board_id: string; metadata: Record<string, unknown> | null };
const db = vi.hoisted(() => ({
  cards: [] as Card[],
  doneColumns: [] as { id: string; board_id: string }[],
  openChildren: [] as { parent_task_id: string }[],
  cardFilters: [] as [string, unknown][],
}));

function query(table: string) {
  const filters: [string, unknown][] = [];
  const q: Record<string, unknown> = {};
  for (const op of ["select", "eq", "is", "not", "ilike", "in", "order"]) {
    q[op] = (...args: unknown[]) => (filters.push([`${op}:${String(args[0])}`, args[1]]), q);
  }
  const answer = () => {
    if (table === "board_columns") return { data: db.doneColumns, error: null };
    if (filters.some(([f]) => f === "in:parent_task_id")) return { data: db.openChildren, error: null };
    db.cardFilters.push(...filters);
    return { data: db.cards, error: null };
  };
  q.range = async () => answer();
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(answer()).then(resolve);
  return q;
}
vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: (t: string) => query(t) } }));
const land = vi.hoisted(() => vi.fn(async (_input: Record<string, unknown>) => ({ ok: true as const })));
vi.mock("./system-moves", () => ({ landCardAsSystem: land }));

const { landCardsForMergedPullRequests, landCardsWithMergedStamps } = await import("./pr-done");

const PR = "https://github.com/edge8-ai/edge8-web/pull/1976";
const merged = (state: "merged" | "open" | "closed" = "merged") => ({ pullRequests: [{ url: PR, number: 1976, title: "Effect ledger in use", state }] });

beforeEach(() => {
  db.cards = [{ id: "c1", board_id: "b1", metadata: { pr_url: PR } }];
  db.doneColumns = [{ id: "done-1", board_id: "b1" }];
  db.openChildren = [];
  db.cardFilters.length = 0;
  land.mockClear();
});

describe("landCardsForMergedPullRequests (Z.16)", () => {
  it("lands an open card that links a merged PR in its board's Done column, marked with the PR", async () => {
    await landCardsForMergedPullRequests(merged());
    expect(land).toHaveBeenCalledOnce();
    expect(land.mock.calls[0][0]).toMatchObject({
      taskId: "c1",
      toColumnId: "done-1",
      label: "GitHub: PR #1976 merged",
      also: { metadata: { pr_url: PR, pr_done: "edge8-ai/edge8-web#1976", pr_synced: { key: "edge8-ai/edge8-web#1976", state: "merged" } } },
    });
  });

  it("reads only open, unarchived, top-level cards, narrowed to the PR's number", async () => {
    await landCardsForMergedPullRequests(merged());
    expect(db.cardFilters).toEqual(
      expect.arrayContaining([
        ["eq:status", "open"],
        ["is:archived_at", null],
        ["is:parent_task_id", null],
        ["ilike:metadata->>pr_url", "%/pull/1976%"],
      ]),
    );
  });

  it("does nothing for a PR that is open or closed without merging", async () => {
    await landCardsForMergedPullRequests(merged("open"));
    await landCardsForMergedPullRequests(merged("closed"));
    expect(land).not.toHaveBeenCalled();
  });

  it("leaves a card with an open subtask or blocker where it is", async () => {
    db.openChildren = [{ parent_task_id: "c1" }];
    await landCardsForMergedPullRequests(merged());
    expect(land).not.toHaveBeenCalled();
  });

  it("keeps a person's answer: a card it already landed for this PR is not landed again", async () => {
    db.cards = [{ id: "c1", board_id: "b1", metadata: { pr_url: PR, pr_done: "edge8-ai/edge8-web#1976" } }];
    await landCardsForMergedPullRequests(merged());
    expect(land).not.toHaveBeenCalled();
  });

  it("matches by owner, repo and number, so another repo's PR of the same number is left alone", async () => {
    db.cards = [{ id: "c2", board_id: "b1", metadata: { pr_url: "https://github.com/edge8-ai/other-repo/pull/1976" } }];
    await landCardsForMergedPullRequests(merged());
    expect(land).not.toHaveBeenCalled();
  });

  it("lands the others and reports one card whose board has no Done column", async () => {
    db.cards = [
      { id: "c1", board_id: "b1", metadata: { pr_url: PR } },
      { id: "c3", board_id: "b-no-done", metadata: { pr_url: PR } },
    ];
    await expect(landCardsForMergedPullRequests(merged())).rejects.toThrow(/c3: its board has no Done column/);
    expect(land.mock.calls.map((c) => c[0].taskId)).toEqual(["c1"]);
  });
});

// Z.22: the night's event names a merged PR once. A card it passed by for an
// open subtask is landed by the daily routine once that subtask closes, read
// from the merged stamp the sync left on the card.
describe("landCardsWithMergedStamps (Z.22)", () => {
  const KEY = "edge8-ai/edge8-web#1976";
  const stamped = (over: Record<string, unknown> = {}) => ({
    pr_url: PR,
    pr_synced: { key: KEY, title: "Effect ledger in use", state: "merged" },
    ...over,
  });

  it("lands a card whose last subtask closed after the merge sync passed it by", async () => {
    // The night of the merge: one subtask still open, so the event leaves it.
    db.openChildren = [{ parent_task_id: "c1" }];
    await landCardsForMergedPullRequests(merged());
    expect(land).not.toHaveBeenCalled();

    // The subtask closes later; the sync never names this PR again.
    db.cards = [{ id: "c1", board_id: "b1", metadata: stamped() }];
    db.openChildren = [];
    expect(await landCardsWithMergedStamps()).toEqual({ landed: 1, waiting: 0, failed: [] });
    expect(land).toHaveBeenCalledOnce();
    expect(land.mock.calls[0][0]).toMatchObject({
      taskId: "c1",
      toColumnId: "done-1",
      label: "GitHub: PR #1976 merged",
      also: { metadata: { pr_url: PR, pr_done: KEY, pr_synced: { key: KEY, state: "merged" } } },
    });
  });

  it("reads only open, top-level cards whose stamp says merged", async () => {
    db.cards = [];
    await landCardsWithMergedStamps();
    expect(db.cardFilters).toEqual(
      expect.arrayContaining([
        ["eq:status", "open"],
        ["is:archived_at", null],
        ["is:parent_task_id", null],
        ["eq:metadata->pr_synced->>state", "merged"],
      ]),
    );
  });

  it("counts a card that still has an open child as waiting, and leaves it", async () => {
    db.cards = [{ id: "c1", board_id: "b1", metadata: stamped() }];
    db.openChildren = [{ parent_task_id: "c1" }];
    expect(await landCardsWithMergedStamps()).toEqual({ landed: 0, waiting: 1, failed: [] });
    expect(land).not.toHaveBeenCalled();
  });

  it("keeps a person's answer: a card already landed for this PR is not landed again", async () => {
    db.cards = [{ id: "c1", board_id: "b1", metadata: stamped({ pr_done: KEY }) }];
    await landCardsWithMergedStamps();
    expect(land).not.toHaveBeenCalled();
  });

  it("leaves a card relinked to another PR, whose merged stamp describes the old link", async () => {
    db.cards = [{ id: "c1", board_id: "b1", metadata: stamped({ pr_url: "https://github.com/edge8-ai/edge8-web/pull/2001" }) }];
    await landCardsWithMergedStamps();
    expect(land).not.toHaveBeenCalled();
  });

  it("lands a card relinked to a new PR whose own stamp says merged, though an older PR's mark is on it", async () => {
    db.cards = [{ id: "c1", board_id: "b1", metadata: stamped({ pr_done: "edge8-ai/edge8-web#1500" }) }];
    expect((await landCardsWithMergedStamps()).landed).toBe(1);
  });

  it("names a card whose board has no Done column and still lands the others", async () => {
    db.cards = [
      { id: "c1", board_id: "b1", metadata: stamped() },
      { id: "c3", board_id: "b-no-done", metadata: stamped() },
    ];
    expect(await landCardsWithMergedStamps()).toEqual({ landed: 1, waiting: 0, failed: ["c3: its board has no Done column"] });
  });
});
