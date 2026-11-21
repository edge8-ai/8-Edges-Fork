import { beforeEach, describe, expect, it, vi } from "vitest";
import { calls, fakeSupabase, resetFake, script } from "@/kernel/data/testing/fake-company-os";

// The manager's one question (QS.9; story 55; ADR 0020): "who among my reports
// missed <one named Bounty>?". The name is resolved to exactly one Bounty, that
// one Bounty's report is read with the report's own reach, and a name that
// could mean several is asked back, never answered for each of them.
vi.mock("@/kernel/data/supabase", () => fakeSupabase());
const PEOPLE: Record<string, string> = { giver: "Gia Giver", report1: "Anh Report", other: "Binh Other" };
vi.mock("@/kernel/identity/team-people", () => ({
  peopleOnRecord: async (ids: string[]) => new Map(ids.filter((id) => PEOPLE[id]).map((id) => [id, { name: PEOPLE[id], archived: false }])),
}));

const { askQuestReport, nameableBounties, pickBounty, REACHES_NOBODY } = await import("./report-question");

const NOW = new Date("2026-10-27T03:00:00Z");
const Q1 = "11111111-1111-4111-8111-111111111111";
const Q2 = "22222222-2222-4222-8222-222222222222";
const option = (id: string, title: string, state: "open" | "closed" = "closed") => ({ id, title, state, createdAt: "2026-10-20T00:00:00Z", closedAt: state === "closed" ? "2026-10-24T11:00:00Z" : null });

/** A manager whose one direct report is report1: quests.report at team scope. */
const manager = { personId: "mgr", access: { may: (p: string, t?: { person?: string }) => p === "quests.report" && (!t?.person || t.person === "report1") } };

beforeEach(() => resetFake());

describe("pickBounty", () => {
  const options = [option(Q1, "Watch the launch"), option(Q2, "Watch the launch replay", "open")];

  it("takes an exact title over a longer one that contains it, and a part of a title when only one has it", () => {
    expect(pickBounty(options, "watch the launch")).toEqual({ ok: true, id: Q1 });
    expect(pickBounty(options, "replay")).toEqual({ ok: true, id: Q2 });
  });

  it("asks back when a name could mean several Bounties, with their titles, and refuses one that means none", () => {
    expect(pickBounty(options, "watch")).toEqual({
      ok: false,
      error: '"watch" matches more than one Bounty: Watch the launch (closed Sat 24 Oct, 18:00 Saigon); Watch the launch replay (open). Ask which one.',
    });
    expect(pickBounty(options, "retreat")).toMatchObject({ ok: false, error: expect.stringContaining("No Bounty you can ask about") });
    expect(pickBounty(options, " ")).toMatchObject({ ok: false });
  });
});

describe("nameableBounties", () => {
  const old = { ...option(Q2, "Old launch"), closedAt: "2026-09-01T11:00:00Z" };
  const options = [option(Q1, "Watch the launch"), old, { ...option("q3", "Still open", "open"), createdAt: "2026-08-01T00:00:00Z" }];

  it("offers a manager only the open Bounties and those closed within the board's window, and an admin every one", () => {
    expect(nameableBounties(options, false, NOW).map((o) => o.title)).toEqual(["Watch the launch", "Still open"]);
    expect(nameableBounties(options, true, NOW).map((o) => o.title)).toEqual(["Watch the launch", "Old launch", "Still open"]);
  });

  it("never lists an older title to a manager in the question back", () => {
    const asked = pickBounty(nameableBounties(options, false, NOW), "launch");
    expect(asked).toEqual({ ok: true, id: Q1 });
  });
});

describe("askQuestReport", () => {
  const head = { id: "h1", quest_id: Q1, position: 1, ask: "Watch it", closes_at: "2026-10-24T11:00:00Z", closed_at: "2026-10-24T11:00:00Z" };
  const quest = { id: Q1, kind: "bounty", title: "Watch the launch", ask: "", giver_id: "giver", state: "closed", learning: false, required: false, closing_date: "2026-10-24", closed_at: "2026-10-24T11:00:00Z", created_at: "2026-10-20T00:00:00Z" };
  const party = (person: string, standing: string) => ({ id: `p-${person}`, quest_id: Q1, head_id: "h1", person_id: person, standing, late: false, accepted_at: null, turned_in_at: null, handed_back_at: null, missed_at: null, turn_in_text: null });

  it("reads the one Bounty the name means, and answers with the people the manager reaches only", async () => {
    script("quests", { data: [{ id: Q1, title: "Watch the launch", state: "closed", created_at: "2026-10-20T00:00:00Z", closed_at: "2026-10-24T11:00:00Z", kind: "bounty" }] }, { data: [quest] });
    script("quest_heads", { data: [head] });
    script("quest_party", { data: [party("report1", "missed"), party("other", "missed")] });
    const out = await askQuestReport(manager, "the launch", NOW);
    expect(out).toEqual({
      ok: true,
      answer: {
        bounty: { title: "Watch the launch", state: "closed", required: false, giver: "Gia Giver", closed: "Sat 24 Oct, 18:00 Saigon" },
        heads: [{ ask: "Watch it", due: "Sat 24 Oct, 18:00 Saigon", closed: true }],
        called: 2,
        people: [{ name: "Anh Report", heads: ["Missed"] }],
      },
    });
    expect(JSON.stringify(out)).not.toContain("Binh Other");
    // One Bounty's party, and nothing about anyone across Bounties.
    const partyReads = calls.filter((c) => c.table === "quest_party");
    expect(partyReads).toHaveLength(1);
    expect(partyReads[0]!.filters).toContainEqual(["eq", "quest_id", Q1]);
  });

  it("asks back on an ambiguous name without reading any Bounty's party", async () => {
    script("quests", { data: [option(Q1, "Watch the launch"), option(Q2, "Watch the launch replay")].map((o) => ({ id: o.id, title: o.title, state: o.state, created_at: o.createdAt, closed_at: o.closedAt, kind: "bounty" })) });
    const out = await askQuestReport(manager, "watch", NOW);
    expect(out).toMatchObject({ ok: false, error: expect.stringContaining("Ask which one") });
    expect(calls.filter((c) => c.table === "quest_party" || c.table === "quest_heads")).toEqual([]);
  });

  it("tells a manager who reaches nobody on the Bounty only that, with none of its heads or its count", async () => {
    script("quests", { data: [{ id: Q1, title: "Watch the launch", state: "closed", created_at: "2026-10-20T00:00:00Z", closed_at: "2026-10-24T11:00:00Z", kind: "bounty" }] }, { data: [quest] });
    script("quest_heads", { data: [head] });
    script("quest_party", { data: [party("other", "missed")] });
    expect(await askQuestReport(manager, "Watch the launch", NOW)).toEqual({ ok: true, answer: { bounty: { title: "Watch the launch" }, nobody: REACHES_NOBODY } });
  });

  it("lets an admin name a Bounty closed before the board's window, which a manager cannot", async () => {
    const admin = { personId: "adm", access: { may: (p: string) => p === "quests.report" } };
    const oldRow = { id: Q1, title: "Watch the launch", state: "closed", created_at: "2026-08-20T00:00:00Z", closed_at: "2026-09-01T11:00:00Z", kind: "bounty" };
    script("quests", { data: [oldRow] });
    expect(await askQuestReport(manager, "Watch the launch", NOW)).toMatchObject({ ok: false, error: expect.stringContaining("No Bounty you can ask about") });
    expect(calls.filter((c) => c.table === "quest_party")).toEqual([]);
    resetFake();
    script("quests", { data: [oldRow] }, { data: [{ ...quest, closed_at: "2026-09-01T11:00:00Z" }] });
    script("quest_heads", { data: [head] });
    script("quest_party", { data: [party("other", "missed")] });
    expect(await askQuestReport(admin, "Watch the launch", NOW)).toMatchObject({ ok: true, answer: { people: [{ name: "Binh Other", heads: ["Missed"] }] } });
  });

  it("refuses someone who does not hold quests.report before reading anything", async () => {
    const member = { personId: "m", access: { may: () => false } };
    expect(await askQuestReport(member, "Watch the launch", NOW)).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });
});
