import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";
import type { BurningFire } from "./campfires-model";
import type { QuestState, Standing } from "./standing";

// What is open for one person (QS.9; ADR 0020): the read behind the team
// assistant's "what quests are open for me?". It answers about the reader
// alone: their own Standing on each open head they still owe, the fires they
// sit by or host, and the fires they may light as a Beacon. Nobody else's
// Standing is in it, and the only other people it names are the Givers and
// the Hosts the whole team already sees.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const PEOPLE: Record<string, string> = { giver: "Gia Giver", boss: "Bao Boss" };
vi.mock("@/kernel/identity/team-people", () => ({
  peopleOnRecord: async (ids: string[]) => new Map(ids.filter((id) => PEOPLE[id]).map((id) => [id, { name: PEOPLE[id], archived: false }])),
}));
const fires: BurningFire[] = [];
vi.mock("./campfires-read", () => ({ readCampfires: async () => ({ wanted: [], burning: fires }) }));
vi.mock("./lighthouses-read", () => ({ readHeldFires: async () => [{ questId: "r9", title: "Prompt evals", originIdeaId: null }] }));

const { readOpenQuests, shapeOpenQuests } = await import("./open-quests");

const NOW = new Date("2026-10-27T03:00:00Z");
const quest = (id: string, over: { kind?: string; state?: QuestState; ask?: string; giver_id?: string; required?: boolean } = {}) => ({ id, kind: "bounty", title: `Quest ${id}`, ask: "", giver_id: "giver", state: "open" as QuestState, required: false, ...over });
const head = (id: string, questId: string, position: number, closesAt: string, closedAt: string | null = null) => ({ id, quest_id: questId, position, ask: `Ask ${id}`, closes_at: closesAt, closed_at: closedAt });
const row = (person: string, questId: string, headId: string, standing: Standing) => ({ quest_id: questId, head_id: headId, person_id: person, standing });
const portrait = (personId: string, name: string) => ({ personId, name, initials: name.slice(0, 2) });
const fire = (over: Partial<BurningFire>): BurningFire =>
  ({ questId: "r1", title: "Lark bots", host: portrait("host", "Hoa Host"), youHost: false, startsAt: "2026-10-29T09:00:00.000Z", seats: 3, faces: [portrait("seat", "Sy Seat")], seated: false, sessionHref: null, endedAt: null, ...over }) as BurningFire;

beforeEach(() => {
  resetFake();
  fires.length = 0;
});

describe("shapeOpenQuests", () => {
  const names = new Map([["giver", "Gia Giver"], ["boss", "Bao Boss"]]);

  it("lists the Bounties the reader still owes, each open head with its ask, its Saigon due time and the reader's own Standing", () => {
    const value = shapeOpenQuests(
      "me",
      {
        party: [row("me", "q1", "h1", "called"), row("me", "q1", "h2", "accepted"), row("me", "q2", "h3", "accepted")],
        quests: [quest("q1", { ask: "Two asks", required: false }), quest("q2", { giver_id: "boss", required: true })],
        heads: [head("h1", "q1", 1, "2026-10-31T11:00:00Z"), head("h2", "q1", 2, "2026-11-03T11:00:00Z"), head("h3", "q2", 1, "2026-10-28T11:00:00Z")],
        names,
      },
      [],
      [],
      NOW,
    );
    expect(value.bounties).toEqual([
      { title: "Quest q2", note: null, giver: "Bao Boss", required: true, heads: [{ ask: "Ask h3", dueAt: "2026-10-28T11:00:00Z", due: "Wed 28 Oct, 18:00 Saigon", yours: "accepted" }] },
      {
        title: "Quest q1",
        note: "Two asks",
        giver: "Gia Giver",
        required: false,
        heads: [
          { ask: "Ask h1", dueAt: "2026-10-31T11:00:00Z", due: "Sat 31 Oct, 18:00 Saigon", yours: "called" },
          { ask: "Ask h2", dueAt: "2026-11-03T11:00:00Z", due: "Tue 3 Nov, 18:00 Saigon", yours: "accepted" },
        ],
      },
    ]);
  });

  it("reads only the reader's own rows: a teammate's row on a quest the reader is not on adds nothing, and nobody else's Standing appears", () => {
    const value = shapeOpenQuests(
      "me",
      {
        party: [row("mate", "q1", "h1", "called"), row("me", "q2", "h2", "called"), row("mate", "q2", "h2", "missed")],
        quests: [quest("q1"), quest("q2")],
        heads: [head("h1", "q1", 1, "2026-10-31T11:00:00Z"), head("h2", "q2", 1, "2026-10-31T11:00:00Z")],
        names,
      },
      [],
      [],
      NOW,
    );
    expect(value.bounties.map((b) => b.title)).toEqual(["Quest q2"]);
    expect(value.bounties[0]!.heads).toHaveLength(1);
    expect(JSON.stringify(value)).not.toMatch(/mate|missed/);
  });

  it("drops a closed head, a Bounty the reader has answered, a closed or withdrawn quest, and anything that is not a Bounty", () => {
    const value = shapeOpenQuests(
      "me",
      {
        party: [
          row("me", "past", "hp", "accepted"),
          row("me", "done", "hd", "turned_in"),
          row("me", "back", "hb", "handed_back"),
          row("me", "shut", "hs", "accepted"),
          row("me", "gone", "hg", "accepted"),
          row("me", "raid", "hr", "accepted"),
        ],
        quests: [quest("past"), quest("done"), quest("back"), quest("shut", { state: "closed" }), quest("gone", { state: "withdrawn" }), quest("raid", { kind: "raid" })],
        heads: [
          head("hp", "past", 1, "2026-10-26T11:00:00Z"),
          head("hd", "done", 1, "2026-10-31T11:00:00Z"),
          head("hb", "back", 1, "2026-10-31T11:00:00Z"),
          head("hs", "shut", 1, "2026-10-31T11:00:00Z"),
          head("hg", "gone", 1, "2026-10-31T11:00:00Z"),
          head("hr", "raid", 1, "2026-10-31T11:00:00Z"),
        ],
        names,
      },
      [],
      [],
      NOW,
    );
    expect(value.bounties).toEqual([]);
  });

  it("keeps the fires the reader sits by or hosts, with only the Host named, and the held fires as Beacons to light", () => {
    const value = shapeOpenQuests(
      "me",
      { party: [], quests: [], heads: [], names },
      [fire({ questId: "a", title: "Seated", seated: true }), fire({ questId: "b", title: "Not mine" }), fire({ questId: "c", title: "Mine", youHost: true, host: portrait("me", "Me Reader"), endedAt: "2026-10-26T09:20:00Z" } as Partial<BurningFire>)],
      [{ questId: "r9", title: "Prompt evals", originIdeaId: null }],
      NOW,
    );
    expect(value.fires).toEqual([
      { title: "Seated", host: "Hoa Host", youHost: false, seated: true, startsAt: "2026-10-29T09:00:00.000Z", starts: "Thu 29 Oct, 16:00 Saigon", toMark: false },
      { title: "Mine", host: "Me Reader", youHost: true, seated: false, startsAt: "2026-10-29T09:00:00.000Z", starts: "Thu 29 Oct, 16:00 Saigon", toMark: true },
    ]);
    expect(value.beaconsToLight).toEqual([{ title: "Prompt evals" }]);
    // The people seated by a fire are the page's faces, never the assistant's answer.
    expect(JSON.stringify(value)).not.toContain("Sy Seat");
  });
});

describe("readOpenQuests", () => {
  it("selects only the reader's own party rows still owed, and names only the Givers", async () => {
    script("quest_party", { data: [row("me", "q1", "h1", "called")] });
    script("quests", { data: [quest("q1")] });
    script("quest_heads", { data: [head("h1", "q1", 1, "2026-10-31T11:00:00Z")] });
    const value = await readOpenQuests("me", NOW);
    expect(value.bounties.map((b) => [b.title, b.giver])).toEqual([["Quest q1", "Gia Giver"]]);
    expect(value.beaconsToLight).toEqual([{ title: "Prompt evals" }]);
    const party = calls.find((c) => c.table === "quest_party")!;
    expect(party.filters).toContainEqual(["in", "person_id", ["me"]]);
    expect(party.filters).toContainEqual(["in", "standing", ["called", "accepted"]]);
    // A read, and nothing else.
    expect(calls.flatMap((c) => c.ops).filter((op) => ["insert", "update", "upsert", "delete"].includes(op))).toEqual([]);
  });

  it("raises when the reader's rows cannot be read, rather than saying nothing is open", async () => {
    script("quest_party", { data: null, error: { message: "boom" } });
    await expect(readOpenQuests("me", NOW)).rejects.toThrow(/own party rows/);
  });
});
