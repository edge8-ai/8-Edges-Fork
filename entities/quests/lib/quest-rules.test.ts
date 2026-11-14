import { describe, expect, it } from "vitest";
import { LearningLine, SummonInput, TurnInInput, WillTryInput, isRequiredGiver, partyRows, planBounty } from "./quest-rules";

// The pure half of the summon (QS.1): what the drawer may send, and the rows a
// Bounty becomes. The database and the session stay out of it.

const NOW = new Date("2026-10-20T03:00:00Z");
const STAFF = new Set(["mai", "lan", "dave"]);

const input = (over: Record<string, unknown> = {}) =>
  SummonInput.parse({
    title: "Port Stephens prep",
    learning: false,
    partyPersonIds: ["mai", "lan", "mai"],
    heads: [
      { ask: "Send your flight times", closesAt: "2026-10-22T17:00:00+07:00" },
      { ask: "Share one takeaway", closesAt: "2026-10-24T17:00:00+07:00" },
    ],
    ...over,
  });

describe("SummonInput", () => {
  it("normalises each due time to UTC and keeps the heads in order", () => {
    expect(input().heads.map((h) => h.closesAt)).toEqual(["2026-10-22T10:00:00.000Z", "2026-10-24T10:00:00.000Z"]);
    expect(input().ask).toBe("");
  });

  it.each([
    ["no heads", { heads: [] }],
    ["an empty head ask", { heads: [{ ask: "  ", closesAt: "2026-10-22T17:00:00+07:00" }] }],
    ["a due time that is not a time", { heads: [{ ask: "x", closesAt: "Friday" }] }],
    ["an empty party", { partyPersonIds: [] }],
    ["an empty title", { title: " " }],
  ])("refuses %s", (_what, over) => {
    expect(SummonInput.safeParse({ title: "t", learning: false, partyPersonIds: ["mai"], heads: [{ ask: "a", closesAt: "2026-10-22T17:00:00+07:00" }], ...over }).success).toBe(false);
  });
});

describe("planBounty", () => {
  it("writes the quest, its heads by position, and the party once each, with the latest head's Saigon date", () => {
    const planned = planBounty(input(), "dave", false, STAFF, NOW);
    expect(planned).toEqual({
      ok: true,
      plan: {
        quest: { kind: "bounty", title: "Port Stephens prep", ask: "", giver_id: "dave", closing_date: "2026-10-24", learning: false, required: false },
        heads: [
          { position: 1, ask: "Send your flight times", closes_at: "2026-10-22T10:00:00.000Z" },
          { position: 2, ask: "Share one takeaway", closes_at: "2026-10-24T10:00:00.000Z" },
        ],
        personIds: ["mai", "lan"],
      },
    });
  });

  it("dates closing_date by the Saigon calendar, not UTC", () => {
    const late = input({ heads: [{ ask: "x", closesAt: "2026-10-25T06:00:00+07:00" }] });
    expect(planBounty(late, "dave", false, STAFF, NOW)).toMatchObject({ plan: { quest: { closing_date: "2026-10-25" } } });
  });

  it("refuses someone not on the team", () => {
    expect(planBounty(input({ partyPersonIds: ["mai", "client-contact"] }), "dave", false, STAFF, NOW)).toEqual({ ok: false, error: "Only people on the team can be called on a quest." });
  });

  it("refuses a due time in the past", () => {
    const past = input({ heads: [{ ask: "x", closesAt: "2026-10-19T17:00:00+07:00" }] });
    expect(planBounty(past, "dave", false, STAFF, NOW)).toEqual({ ok: false, error: "Every due time must be in the future." });
  });

  it("carries required onto the quest", () => {
    expect(planBounty(input(), "dave", true, STAFF, NOW)).toMatchObject({ plan: { quest: { required: true } } });
  });
});

describe("partyRows", () => {
  it("writes one called row per person per head on an optional Bounty", () => {
    const rows = partyRows("q", ["h1", "h2"], ["mai", "lan"], false, NOW);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.standing === "called" && r.accepted_at === null)).toBe(true);
    expect(rows.map((r) => `${r.head_id}:${r.person_id}`)).toEqual(["h1:mai", "h1:lan", "h2:mai", "h2:lan"]);
  });

  it("writes every row accepted on a required Bounty, because being called is the commitment", () => {
    const rows = partyRows("q", ["h1"], ["mai"], true, NOW);
    expect(rows).toEqual([{ quest_id: "q", head_id: "h1", person_id: "mai", standing: "accepted", accepted_at: NOW.toISOString() }]);
  });
});

describe("isRequiredGiver", () => {
  it.each([
    [[{ role: "team-member" }], false],
    [[{ role: "team-member" }, { role: "manager" }], true],
    [[{ role: "admin" }], true],
    [[{ role: "contractor" }, { role: "approver" }], false],
  ])("%j is required: %s", (roles, required) => {
    expect(isRequiredGiver(roles)).toBe(required);
  });
});

describe("TurnInInput", () => {
  it("takes text, a link and the Lore choice", () => {
    expect(TurnInInput.parse({ text: "x", url: " https://a.b ", toLore: false })).toEqual({ text: "x", url: "https://a.b", toLore: false });
  });
});

// The Lore's two moves (QS.4): what the composer and Will try may send.
describe("LearningLine and WillTryInput", () => {
  it("takes a line of text and refuses anything else or an oversized payload", () => {
    expect(LearningLine.safeParse("Ask what done means").success).toBe(true);
    for (const bad of [undefined, null, 42, { line: "x" }, "x".repeat(2001)]) expect(LearningLine.safeParse(bad).success).toBe(false);
  });

  it("takes a learning id and a boolean, and refuses a missing id or a truthy non-boolean", () => {
    expect(WillTryInput.parse({ ideaId: " l1 ", on: true })).toEqual({ ideaId: "l1", on: true });
    for (const bad of [{ ideaId: "", on: true }, { ideaId: "l1", on: "true" }, { ideaId: "l1" }, { on: false }]) expect(WillTryInput.safeParse(bad).success).toBe(false);
  });
});
