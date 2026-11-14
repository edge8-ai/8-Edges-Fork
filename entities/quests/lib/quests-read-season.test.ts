import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { HeadRow, PartyDbRow, QuestRow } from "./rows";

// The season banner's counts on the page's read (QS.14, review of #2310). The
// banner is a company total that decides nothing anyone owes, so a failed
// count hides it and draws the rest of the page; the boss, the board and the
// reader's own row are still there. The four counts stand or fall together.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
vi.mock("@/kernel/identity/team-people", () => ({
  peopleOnRecord: async (ids: string[]) => new Map(ids.map((id) => [id, { name: id === "giver" ? "Hoa Le" : "Duc Vo", archived: false }])),
}));

const { readQuestsPage } = await import("./quests-read");
const { seasonHasTally } = await import("../ui/quests-model");

const NOW = new Date("2026-10-23T03:00:00Z");
const QUEST: QuestRow = {
  id: "q1", kind: "bounty", title: "Share one prompt that saved you an hour", ask: "", giver_id: "giver", state: "open",
  learning: false, required: false, closing_date: "2026-10-27", closed_at: null, created_at: "2026-10-20T03:00:00Z",
};
const HEAD: HeadRow = { id: "h1", quest_id: "q1", position: 1, ask: "Share one prompt", closes_at: "2026-10-27T10:00:00Z", closed_at: null };
const ME: PartyDbRow = {
  id: "p1", quest_id: "q1", head_id: "h1", person_id: "me", standing: "called", late: false,
  accepted_at: null, turned_in_at: null, handed_back_at: null, missed_at: null, turn_in_text: null,
};

/**
 * Every answer a table gives, the same each time, so the order the page's
 * reads run in does not matter: a count query reads `count`, a row query reads
 * `data`.
 */
function scriptPage(learnings: { count: number } | { error: { message: string } }) {
  script("quests", ...Array.from({ length: 3 }, () => ({ data: [QUEST], count: 2 })));
  script("quest_party", ...Array.from({ length: 2 }, () => ({ data: [ME], count: 7 })));
  script("quest_heads", { data: [HEAD] });
  script("quest_reactions", { data: [] });
  script("ideas", learnings);
}

beforeEach(() => {
  resetFake();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readQuestsPage: the season's counts", () => {
  it("counts the learnings this season through the Ideas door, beside hits, fires and Beacons", async () => {
    scriptPage({ count: 5 });
    const page = await readQuestsPage("me", NOW);
    expect(page.season).toEqual({ name: "Q4 2026", hits: 7, campfires: 2, beacons: 2, discoveries: 5 });
    expect(seasonHasTally(page.season)).toBe(true);
  });

  it("draws the page with no banner when one count fails: the boss and the reader's own row are all there", async () => {
    scriptPage({ error: { message: "spark is down" } });
    const page = await readQuestsPage("me", NOW);
    // No partial tally: the counts that did answer are not shown beside a wrong zero.
    expect(page.season).toEqual({ name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 });
    expect(seasonHasTally(page.season)).toBe(false);
    expect(page.boss?.id).toBe("q1");
    expect(page.boss?.heads[0]?.mine?.standing).toBe("called");
    expect(page.me.personId).toBe("me");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[quests/read] season tally"), expect.stringContaining("spark is down"));
  });

  it("still raises when the page's own quests cannot be read", async () => {
    script("quests", ...Array.from({ length: 3 }, () => ({ error: { message: "down" } })));
    script("quest_party", { count: 7 });
    script("ideas", { count: 5 });
    await expect(readQuestsPage("me", NOW)).rejects.toThrow();
  });
});
