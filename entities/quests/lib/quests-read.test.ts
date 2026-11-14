import { describe, expect, it } from "vitest";
import { countedOnHead, seasonOf, shapeQuestsPage, type QuestsData } from "./quests-read";
import type { HeadRow, PartyDbRow, QuestRow } from "./rows";

// The read model on rows in memory (QS.1; spec "One read model, three
// audiences", ADR 0020). Three readers open the same page: a party member, the
// Giver and someone on the team who is not on the quest. None of them may learn
// who is out: the page names only the Giver, the people who turned in, and the
// reader themself.

const NOW = new Date("2026-10-23T03:00:00Z"); // Thursday 10:00 in Saigon

const quest = (over: Partial<QuestRow>): QuestRow => ({
  id: "q-hydra",
  kind: "bounty",
  title: "Port Stephens prep",
  ask: "",
  giver_id: "giver",
  state: "open",
  learning: false,
  required: false,
  closing_date: "2026-10-24",
  closed_at: null,
  created_at: "2026-10-20T03:00:00Z",
  ...over,
});

// Head 1 was due Wednesday and has passed; head 2 is due Friday.
const HEADS: HeadRow[] = [
  { id: "h1", quest_id: "q-hydra", position: 1, ask: "Send your flight times", closes_at: "2026-10-22T10:00:00Z", closed_at: null },
  { id: "h2", quest_id: "q-hydra", position: 2, ask: "Share one takeaway", closes_at: "2026-10-24T10:00:00Z", closed_at: null },
];

const row = (id: string, step: string, person: string, standing: PartyDbRow["standing"], over: Partial<PartyDbRow> = {}): PartyDbRow => ({
  id,
  quest_id: "q-hydra",
  head_id: step,
  person_id: person,
  standing,
  late: false,
  accepted_at: null,
  turned_in_at: null,
  handed_back_at: null,
  missed_at: null,
  turn_in_text: null,
  ...over,
});

// Member One turned in both heads; Member Two turned in head 1 late; Member Three accepted and was
// Missed on head 1 and is still out on head 2; Tam never answered.
const PARTY: PartyDbRow[] = [
  row("p1", "h1", "member", "turned_in", { turned_in_at: "2026-10-21T03:00:00Z", turn_in_text: "VN123 at 9" }),
  row("p2", "h2", "member", "turned_in", { turned_in_at: "2026-10-22T03:00:00Z", turn_in_text: "Caching" }),
  row("p3", "h1", "peer", "turned_in", { turned_in_at: "2026-10-22T12:00:00Z", late: true }),
  row("p4", "h2", "peer", "accepted"),
  row("p5", "h1", "third", "missed", { missed_at: "2026-10-22T10:00:00Z" }),
  row("p6", "h2", "third", "accepted"),
  row("p7", "h1", "fourth", "called"),
  row("p8", "h2", "fourth", "called"),
];

const NAMES = new Map([
  ["giver", "The Giver"],
  ["member", "Member One"],
  ["peer", "Member Two"],
  ["third", "Member Three"],
  ["fourth", "Member Four"],
  ["fifth", "Member Five"],
]);

const DATA: QuestsData = {
  quests: [quest({})],
  heads: HEADS,
  party: PARTY,
  reactedPartyIds: new Set(["p1"]),
  names: NAMES,
  season: { name: "Q4 2026", hits: 3, campfires: 0, beacons: 0, discoveries: 0 },
};

/** Every string a page carries, so a name can be looked for anywhere in it. */
const text = (v: unknown) => JSON.stringify(v);

describe("shapeQuestsPage: who is out never reaches the party", () => {
  it.each([
    ["a party member", "member"],
    ["the Giver", "giver"],
    ["someone not on the quest", "fifth"],
  ])("names no one still out or Missed, for %s", (_who, reader) => {
    const page = shapeQuestsPage(DATA, reader, NOW);
    expect(text(page)).not.toContain("Olu");
    expect(text(page)).not.toContain("Member Four");
    expect(text(page)).not.toContain("third");
    expect(text(page)).not.toContain("\"missed\"");
  });

  it("lights only the people who turned in, newest first", () => {
    const boss = shapeQuestsPage(DATA, "fifth", NOW).boss!;
    expect(boss.heads[0].lit.map((p) => p.personId)).toEqual(["peer", "member"]);
    expect(boss.heads[1].lit.map((p) => p.personId)).toEqual(["member"]);
  });

  it("tells a Missed person their own Standing, and only theirs", () => {
    const boss = shapeQuestsPage(DATA, "third", NOW).boss!;
    expect(boss.heads[0].mine).toEqual({ standing: "missed", late: false, turnInText: null, reacted: false });
    expect(boss.heads[1].mine?.standing).toBe("accepted");
    expect(boss.isMine).toBe(true);
  });

  it("gives the party member their row on each head, with the Reaction it carries", () => {
    const boss = shapeQuestsPage(DATA, "member", NOW).boss!;
    expect(boss.heads.map((h) => h.mine)).toEqual([
      { standing: "turned_in", late: false, turnInText: "VN123 at 9", reacted: true },
      { standing: "turned_in", late: false, turnInText: "Caching", reacted: false },
    ]);
    expect(boss.isGiver).toBe(false);
  });

  it("marks the Giver, and gives a reader off the party no row", () => {
    expect(shapeQuestsPage(DATA, "giver", NOW).boss).toMatchObject({ isGiver: true, isMine: false });
    const off = shapeQuestsPage(DATA, "fifth", NOW).boss!;
    expect(off.isMine).toBe(false);
    expect(off.heads.every((h) => h.mine === null)).toBe(true);
  });
});

describe("shapeQuestsPage: the Giver's party (ADR 0020)", () => {
  it("lists everyone called for the Giver of a required quest, who was a manager or an admin at summon, lit first", () => {
    const party = shapeQuestsPage({ ...DATA, quests: [quest({ required: true })] }, "giver", NOW).boss!.giverParty;
    expect(party?.called).toBe(4);
    expect(party?.members?.map((m) => [m.name, m.lit, m.headsIn, m.heads])).toEqual([
      ["Member One", true, 2, 2],
      ["Member Four", false, 0, 2],
      ["Member Three", false, 0, 2],
      ["Member Two", false, 1, 2],
    ]);
  });

  it("gives the Giver of an optional quest the count and no names", () => {
    const page = shapeQuestsPage(DATA, "giver", NOW);
    expect(page.boss!.giverParty).toEqual({ called: 4, members: null });
    expect(text(page)).not.toContain("Member Four");
    expect(text(page)).not.toContain("Member Three");
  });

  it.each([
    ["a party member", "member"],
    ["someone not on the quest", "fifth"],
  ])("gives %s nothing of it, on a required quest too", (_who, reader) => {
    const page = shapeQuestsPage({ ...DATA, quests: [quest({ required: true })] }, reader, NOW);
    expect(page.boss!.giverParty).toBeNull();
    expect(text(page)).not.toContain("Member Four");
    expect(text(page)).not.toContain("Member Three");
    expect(text(page)).not.toContain("\"missed\"");
  });
});

describe("shapeQuestsPage: heads, HP and the monster", () => {
  it("draws two heads as a Hydra, the party counted once each", () => {
    const boss = shapeQuestsPage(DATA, "fifth", NOW).boss!;
    expect(boss.monster).toBe("hydra");
    expect(boss.partySize).toBe(4);
    expect(boss.heads.map((h) => h.position)).toEqual([1, 2]);
  });

  it("closes a head at its due time and gives it a verdict, leaving the next open", () => {
    const [first, second] = shapeQuestsPage(DATA, "fifth", NOW).boss!.heads;
    // Head 1 closed: Tam never accepted an optional Bounty, so is not counted;
    // two of the three who are (One, Two, Three) turned in.
    expect(first).toMatchObject({ closed: true, hits: 2, hp: 33, verdict: "got_away" });
    // Head 2 is open: everyone not handed back counts, Tam included.
    expect(second).toMatchObject({ closed: false, hits: 1, hp: 75, verdict: null });
  });

  it("takes the board card's HP from the open heads", () => {
    expect(shapeQuestsPage(DATA, "fifth", NOW).boss!.hp).toBe(75);
  });

  it("counts everyone on a required Bounty's head, closed or not", () => {
    const required = shapeQuestsPage({ ...DATA, quests: [quest({ required: true })] }, "fifth", NOW).boss!;
    expect(required.required).toBe(true);
    expect(required.heads[0]).toMatchObject({ hits: 2, hp: 50 });
  });

  it("keeps a one-head Bounty the ordinary monster", () => {
    const one: QuestsData = { ...DATA, heads: [HEADS[1]], party: PARTY.filter((r) => r.head_id === "h2") };
    expect(shapeQuestsPage(one, "fifth", NOW).boss!.monster).toBe("slime");
  });
});

describe("shapeQuestsPage: the boss and the board", () => {
  it("makes the open Bounty with the largest party the boss, puts the rest on the board, and leaves withdrawn quests off", () => {
    const small = quest({ id: "q-small", title: "Small" });
    const gone = quest({ id: "q-gone", title: "Gone", state: "withdrawn" });
    const data: QuestsData = {
      ...DATA,
      quests: [quest({}), small, gone],
      heads: [...HEADS, { ...HEADS[1], id: "s1", quest_id: "q-small", position: 1 }, { ...HEADS[1], id: "g1", quest_id: "q-gone", position: 1 }],
      party: [...PARTY, { ...row("s-p", "s1", "fifth", "called"), quest_id: "q-small" }],
    };
    const page = shapeQuestsPage(data, "fifth", NOW);
    expect(page.boss?.id).toBe("q-hydra");
    expect(page.board.map((c) => c.id)).toEqual(["q-small"]);
    expect(page.me).toEqual({ personId: "fifth", name: "Member Five", initials: "MF" });
  });

  it("puts only Bounties on the tavern board: a Raid is Campfires', even one carrying a head (QS.14)", () => {
    const raid = quest({ id: "q-raid", kind: "raid", title: "Prompt evals" });
    const data: QuestsData = {
      ...DATA,
      quests: [quest({}), raid],
      heads: [...HEADS, { ...HEADS[1], id: "r1", quest_id: "q-raid", position: 1 }],
      party: [...PARTY, { ...row("r-p", "r1", "fifth", "called"), quest_id: "q-raid" }],
    };
    const page = shapeQuestsPage(data, "fifth", NOW);
    expect(page.boss?.id).toBe("q-hydra");
    expect(page.board).toEqual([]);
  });

  it("leaves the opening note null when the Giver wrote none", () => {
    expect(shapeQuestsPage(DATA, "fifth", NOW).boss!.ask).toBeNull();
    expect(shapeQuestsPage({ ...DATA, quests: [quest({ ask: "For the retreat" })] }, "fifth", NOW).boss!.ask).toBe("For the retreat");
  });
});

describe("countedOnHead", () => {
  const rows = [{ standing: "called" as const }, { standing: "accepted" as const }, { standing: "handed_back" as const }, { standing: "turned_in" as const }];
  it.each([
    [false, false, 3],
    [false, true, 2],
    [true, false, 3],
    [true, true, 3],
  ])("required %s, closed %s counts %i", (required, closed, n) => {
    expect(countedOnHead(rows, required, closed)).toBe(n);
  });
});

describe("seasonOf", () => {
  it("is the Saigon quarter, beginning at Saigon midnight", () => {
    expect(seasonOf(NOW)).toEqual({ name: "Q4 2026", startsAt: "2026-09-30T17:00:00.000Z" });
    // 31 December 23:30 UTC is already 1 January in Saigon.
    expect(seasonOf(new Date("2026-12-31T17:30:00Z")).name).toBe("Q1 2027");
  });
});

describe("shapeQuestsPage: a Beacon stands on the horizon, never on the board (QS.6)", () => {
  it("leaves a lit Beacon off the board and out of the arena, though it has a head and a Turn-in", () => {
    const beacon = quest({ id: "b1", kind: "beacon", title: "Talk at the meetup", giver_id: "member", state: "closed", closing_date: null, closed_at: "2026-10-23T02:00:00Z" });
    const data: QuestsData = {
      ...DATA,
      quests: [quest({}), beacon],
      heads: [...HEADS, { id: "bh", quest_id: "b1", position: 1, ask: "Light it with a link to the public thing.", closes_at: "2026-10-23T02:00:00Z", closed_at: "2026-10-23T02:00:00Z" }],
      party: [...PARTY, row("bp", "bh", "member", "turned_in", { quest_id: "b1", turned_in_at: "2026-10-23T02:00:00Z" })],
    };
    const page = shapeQuestsPage(data, "member", NOW);
    expect(page.boss?.id).toBe("q-hydra");
    expect(page.board.map((c) => c.id)).not.toContain("b1");
  });
});
