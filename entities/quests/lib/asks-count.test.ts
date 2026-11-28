import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The Asks row's count in the team sidebar (AK.2): how many asks wait on the
// person, the same number the page's Waiting on you lists. Names are invented.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());

const { asksNavCounts } = await import("./asks-count");

// Wednesday 18 November 2026, 10:00 in Saigon.
const NOW = new Date("2026-11-18T03:00:00.000Z");

const quest = (id: string, required: boolean) => ({
  id, kind: "bounty", title: "An ask", ask: "", giver_id: "lead", state: "open", learning: false, required, closing_date: null, closed_at: null, created_at: "2026-11-16T03:00:00.000Z",
});
const head = (id: string, questId: string, closesAt: string) => ({ id, quest_id: questId, position: 0, ask: "An ask", closes_at: closesAt, closed_at: null });
const row = (id: string, questId: string, headId: string, standing: string) => ({
  id, quest_id: questId, head_id: headId, person_id: "me", standing, late: false,
  accepted_at: null, turned_in_at: null, handed_back_at: null, missed_at: null, turn_in_text: null, turn_in_url: null,
});

beforeEach(() => {
  resetFake();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("the Asks row's count", () => {
  it("counts the required asks still owed, keyed by the Asks row's address", async () => {
    script("quest_party", { data: [row("p1", "qw", "hw", "accepted"), row("p2", "qo", "ho", "called"), row("p3", "qp", "hp", "accepted")] });
    script("quests", { data: [quest("qw", true), quest("qo", false), quest("qp", true)] });
    // The third ask's due time has passed, so it no longer waits on anyone.
    script("quest_heads", { data: [head("hw", "qw", "2026-11-20T11:00:00.000Z"), head("ho", "qo", "2026-11-20T11:00:00.000Z"), head("hp", "qp", "2026-11-17T11:00:00.000Z")] });
    expect(await asksNavCounts("me")).toEqual({ "/team/asks": 1 });
  });

  it("is zero when nothing is asked of the person", async () => {
    script("quest_party", { data: [] });
    expect(await asksNavCounts("me")).toEqual({ "/team/asks": 0 });
  });

  it("draws no count, rather than a wrong one, when the read fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    script("quest_party", { error: { message: "connection reset" } });
    expect(await asksNavCounts("me")).toEqual({});
    quiet.mockRestore();
  });
});
