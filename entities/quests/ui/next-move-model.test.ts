import { describe, expect, it } from "vitest";
import type { LearnShareStanding } from "@/entities/ladders";
import type { Campfires } from "../lib/campfires-model";
import type { HeadCard, Portrait, QuestCard } from "../lib/quests-read";
import { nextMoves, placeWords, readerBlock } from "./next-move-model";
import { READER_LANDS } from "./lands-fixtures";

// Your next move (QS.13; spec "Your next move"): which acts are open to the
// reader now, the points each earns and where it would take them, all read
// from the ladders' standing; with none, the same acts and no number.

const NOW = "2026-10-23T03:00:00.000Z";
const who = (personId: string, name: string): Portrait => ({ personId, name, initials: name.slice(0, 2).toUpperCase() });
const GIVER = who("giver", "Gia");
const head = (over: Partial<HeadCard> = {}): HeadCard => ({
  id: "h1", position: 1, ask: "Watch the launch video", closesAt: "2026-10-24T11:00:00.000Z", closed: false, hits: 0, hp: 100, verdict: null, lit: [], mine: null, ...over,
});
const mine = (standing: NonNullable<HeadCard["mine"]>["standing"]) => ({ standing, late: false, turnInText: null, reacted: false });
const boss = (heads: HeadCard[], over: Partial<QuestCard> = {}): QuestCard => ({
  id: "q1", kind: "bounty", title: "Gia's launch video", ask: null, giver: GIVER, state: "open", learning: false, required: true, partySize: 6, monster: "dragon",
  heads, hp: 100, isGiver: false, isMine: true, giverParty: null, ...over,
});
const NO_FIRES: Campfires = { wanted: [], burning: [] };
const FIRES: Campfires = {
  wanted: [
    { key: "evals", topic: "prompt evals", hands: 4, mine: false },
    { key: "figma", topic: "Figma to code", hands: 6, mine: true },
    { key: "sql", topic: "SQL windows", hands: 2, mine: false },
  ],
  burning: [{ questId: "r1", title: "Claude in Sheets", host: who("me", "Me Reader"), youHost: true, startsAt: "2026-10-29T09:00:00.000Z", seats: 0, faces: [], seated: false, sessionHref: null, endedAt: null }],
};
// The reader at 400: Gold III, 375 to 450. A fire (+100) reaches Gold II; a Beacon (+250) Platinum IV, a new tier.
const ROMAN = ["", "I", "II", "III", "IV"] as const;
/** A place as the ladders word it; the test spells the numerals the page no longer holds. */
const at = (tierName: string, division: 1 | 2 | 3 | 4 | null) => ({ tierName, division, words: { game: division ? `${tierName} ${ROMAN[division]}` : tierName, plain: division ? `${tierName}, division ${ROMAN[division]}` : tierName } });
const STANDING: LearnShareStanding = {
  ...at("Gold", 3), points: 400, divisionStart: 375, next: { ...at("Gold", 2), start: 450 },
  pointsFor: { hit: 10, learning: 10, fire: 100, beacon: 250 },
  reaches: {
    hit: { ...at("Gold", 3), newTier: false },
    learning: { ...at("Gold", 3), newTier: false },
    fire: { ...at("Gold", 2), newTier: false },
    beacon: { ...at("Platinum", 4), newTier: true },
  },
  helm: null,
  lands: READER_LANDS,
};
const base = { boss: null, firstSpark: true, campfires: NO_FIRES, beacons: false, standing: STANDING, game: true, now: NOW };

describe("nextMoves", () => {
  it("offers Turn in on the Bounty while the reader owes an open head, with its points and where it takes them", () => {
    const [card] = nextMoves({ ...base, boss: boss([head({ mine: mine("called") })]) });
    expect(card).toMatchObject({ act: "hit", done: false, name: "Turn in on the Bounty", points: 10, lands: { place: "Gold III", newTier: false }, go: { move: "turn-in" } });
    expect(card.hint).toMatch(/^Gia's launch video · Closes /);
  });

  it("keeps the Bounty as done once turned in, with no lands line", () => {
    const [card] = nextMoves({ ...base, boss: boss([head({ mine: mine("turned_in") })]) });
    expect(card).toMatchObject({ done: true, name: "Turned in on the Bounty", hint: "Hit landed · Gia will see it", points: 10, lands: null });
  });

  it("still asks while another head is owed, and never for a head handed back or a boss the reader is not on", () => {
    const two = boss([head({ mine: mine("turned_in") }), head({ id: "h2", position: 2, mine: mine("accepted") })]);
    expect(nextMoves({ ...base, boss: two })[0]).toMatchObject({ act: "hit", done: false });
    expect(nextMoves({ ...base, boss: boss([head({ mine: mine("handed_back") })]) })[0].act).toBe("learning");
    expect(nextMoves({ ...base, boss: boss([head()]) })[0].act).toBe("learning");
    expect(nextMoves({ ...base, boss: boss([head({ mine: mine("called"), closed: true })]) })[0].act).toBe("learning");
  });

  it("says Share one learning first and Share another once the reader has shared", () => {
    expect(nextMoves(base)[0]).toMatchObject({ act: "learning", name: "Share one learning", hint: "What did you learn this week?", points: 10, go: { move: "share-learning" } });
    expect(nextMoves({ ...base, firstSpark: false })[0].name).toBe("Share another learning");
  });

  it("offers the cold fire with the most hands, reading → Gold II with no new tier", () => {
    const fire = nextMoves({ ...base, campfires: FIRES }).find((c) => c.act === "fire");
    expect(fire).toMatchObject({ name: "Light the wanted fire on Figma to code", hint: "6 hands up · you would host", points: 100, lands: { place: "Gold II", newTier: false }, go: { move: "light-figma" } });
  });

  it("marks new tier only when the act crosses into one", () => {
    const crossing = { ...STANDING, reaches: { ...STANDING.reaches, fire: { ...at("Platinum", 4), newTier: true } } };
    expect(nextMoves({ ...base, campfires: FIRES, standing: crossing }).find((c) => c.act === "fire")?.lands).toEqual({ place: "Platinum IV", newTier: true });
  });

  it("a held fire is the fire act landed: done, with its points, and it goes to the Lighthouses", () => {
    const cards = nextMoves({ ...base, campfires: NO_FIRES, heldFires: [{ questId: "r9", title: "Prompt evals" }] });
    expect(cards.find((c) => c.act === "fire")).toMatchObject({ done: true, name: "You held Prompt evals", hint: "+100 landed", lands: null, go: { move: null, section: '[data-move-section="lighthouses"]' } });
    // A burning fire the reader hosts comes first; a held one is the done state only once nothing burns.
    const hosting = nextMoves({ ...base, campfires: { ...FIRES, wanted: [] }, heldFires: [{ questId: "r9", title: "Prompt evals" }] }).find((c) => c.act === "fire");
    expect(hosting?.done).toBe(false);
  });

  it("puts the reader's ended fire still to mark first, before any cold fire, pointing at its card (QS.5c)", () => {
    const ended = { ...FIRES.burning[0], questId: "r9", title: "Lark bots", sessionHref: "/team/training/sessions/t9", endedAt: "2026-10-22T09:20:00.000Z" };
    const fire = nextMoves({ ...base, campfires: { ...FIRES, burning: [ended, ...FIRES.burning] } }).find((c) => c.act === "fire");
    expect(fire).toMatchObject({ name: "Mark who came at Lark bots", hint: "+100 once someone who came is marked", done: false, go: { move: "host-r9" } });
    const plain = nextMoves({ ...base, game: false, campfires: { ...FIRES, burning: [ended] } }).find((c) => c.act === "fire");
    expect(plain?.hint).toBe("+100 points once someone who came is marked");
  });

  it("with no cold fire, offers the fire the reader hosts", () => {
    const fire = nextMoves({ ...base, campfires: { ...FIRES, wanted: [] } }).find((c) => c.act === "fire");
    expect(fire).toMatchObject({ name: "You host Claude in Sheets", hint: "+100 once someone who came is marked", done: false, go: { move: "host-r1" } });
  });

  it("draws the Beacon only once QS.6 says it can be lit", () => {
    expect(nextMoves(base).some((c) => c.act === "beacon")).toBe(false);
    expect(nextMoves({ ...base, beacons: true }).find((c) => c.act === "beacon")).toMatchObject({ name: "Light a Beacon", points: 250, lands: { place: "Platinum IV", newTier: true } });
  });

  it("shows the four acts without points or tier when there is no standing", () => {
    const cards = nextMoves({ ...base, standing: null, boss: boss([head({ mine: mine("called") })]), campfires: FIRES, beacons: true });
    expect(cards.map((c) => c.act)).toEqual(["hit", "learning", "fire", "beacon"]);
    for (const c of cards) expect(c).toMatchObject({ points: null, lands: null });
    const hosting = nextMoves({ ...base, standing: null, campfires: { ...FIRES, wanted: [] } }).find((c) => c.act === "fire");
    expect(hosting?.hint).toBe("It lands once someone who came is marked");
  });

  it("speaks plainly with the game style off", () => {
    const cards = nextMoves({ ...base, game: false, boss: boss([head({ mine: mine("called") })]), campfires: FIRES, beacons: true });
    expect(cards.map((c) => c.name)).toEqual(["Answer the Bounty", "Share one learning", "Host the session on Figma to code", "Put out a Beacon"]);
    expect(cards[2].lands).toEqual({ place: "Gold, division II", newTier: false });
  });

  it("never uses a word the glossaries avoid", () => {
    const all = [true, false].flatMap((game) =>
      nextMoves({ ...base, game, boss: boss([head({ mine: mine("called") })]), campfires: FIRES, beacons: true }).flatMap((c) => [c.name, c.hint, c.lands?.place ?? ""]),
    );
    expect(all.join(" ")).not.toMatch(/\b(rank|step|level|XP|leaderboard|frame|score)\b/i);
  });
});

describe("readerBlock", () => {
  it("reads Gold III · 400 of 450 with the bar a third of the way", () => {
    expect(readerBlock(STANDING, true)).toMatchObject({ place: "Gold III", points: "400", of: "450", pct: 33 });
    expect(readerBlock(STANDING, false)?.place).toBe("Gold, division III");
  });

  it("is full at the open top, and absent with no standing", () => {
    const top = { ...STANDING, ...at("Sovereign", null), points: 12_000, divisionStart: 10_000, next: null };
    expect(readerBlock(top, true)).toMatchObject({ place: "Sovereign", points: "12,000", of: null, pct: 100 });
    expect(readerBlock(null, true)).toBeNull();
  });

  it("names a place without a division by its tier alone", () => {
    expect(placeWords(at("Sovereign", null), false)).toBe("Sovereign");
  });
});
