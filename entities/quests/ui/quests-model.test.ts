import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccept, canDecline, canHandBack, canTurnIn, dueLine, giverLine, giverMood, headsDownLine,
  headsInNote, hydraLine, litAcross, monsterPreview, movesHint, portraitTone, questDueLine, seasonHasTally, summonRule,
} from "./quests-model";
import { saigonInstant } from "@/kernel/config/dates";
import { headsRefusal } from "./SummonHeads";
import type { HeadCard, QuestCard, Standing } from "../lib/quests-read";

const giver = { personId: "p-g", name: "Member A", initials: "MA" };
const NOW = "2026-10-20T03:00:00Z"; // 10:00 Tuesday 20 October in Saigon

function head(over: Partial<HeadCard> = {}): HeadCard {
  // 18:00 Saigon on Saturday 24 October.
  return { id: "h1", position: 1, ask: "Share one prompt", closesAt: "2026-10-24T11:00:00Z", closed: false, hits: 0, hp: 100, verdict: null, lit: [], mine: null, ...over };
}

function mine(standing: Standing) {
  return { standing, late: false, turnInText: null, reacted: false };
}

function card(over: Partial<QuestCard> = {}): QuestCard {
  return {
    id: "q1", kind: "bounty", title: "Share one prompt", ask: null, giver, state: "open", learning: true, required: false,
    partySize: 10, monster: "big_slime", heads: [head()], hp: 100, isGiver: false, isMine: true, giverParty: null, ...over,
  };
}

describe("the Quests page's words", () => {
  it("says when a head is due, at its Saigon date and time, and how many Saigon days are left", () => {
    expect(dueLine(head(), "open", NOW)).toBe("Closes Sat 24 Oct, 18:00 · 4 days left");
    expect(dueLine(head(), "open", "2026-10-23T03:00:00Z")).toBe("Closes Sat 24 Oct, 18:00 · 1 day left");
    expect(dueLine(head(), "open", "2026-10-24T03:00:00Z")).toBe("Closes today, 18:00");
    expect(dueLine(head(), "open", "2026-10-24T11:00:00Z")).toBe("Closed Sat 24 Oct");
    expect(dueLine(head({ closed: true }), "closed", NOW)).toBe("Closed Sat 24 Oct");
    expect(dueLine(head(), "withdrawn", NOW)).toBe("Withdrawn");
  });

  it("puts the nearest open head's due time on a board card", () => {
    const hydra = card({ heads: [head({ id: "a", closesAt: "2026-10-21T05:00:00Z" }), head({ id: "b" })] });
    expect(questDueLine(hydra, NOW)).toBe("Closes Wed 21 Oct, 12:00 · 1 day left");
    expect(questDueLine(hydra, "2026-10-22T00:00:00Z")).toBe("Closes Sat 24 Oct, 18:00 · 2 days left");
  });

  it("turns a Saigon date and time into one instant, and refuses a head with no ask or a past due time", () => {
    expect(saigonInstant("2026-10-24", "18:00")).toBe("2026-10-24T11:00:00.000Z");
    const now = Date.parse(NOW);
    expect(headsRefusal([{ key: 0, ask: "x", date: "2026-10-24", time: "18:00" }], now)).toBeNull();
    expect(headsRefusal([], now)).toBe("Add a head.");
    expect(headsRefusal([{ key: 0, ask: " ", date: "2026-10-24", time: "18:00" }], now)).toBe("Write the ask for the head.");
    expect(headsRefusal([{ key: 0, ask: "x", date: "2026-10-24", time: "18:00" }, { key: 1, ask: "y", date: "2026-10-20", time: "09:00" }], now)).toBe("The due time for head 2 has already passed.");
  });

  it("lets the Giver's line follow the HP and the close, with the same lightness either way", () => {
    expect(giverLine(card({ hp: 100, monster: "dragon" }), null)).toBe("A dragon's loose in the office. Who strikes first?");
    expect(giverLine(card({ hp: 50 }), null)).toBe("It's wobbling! We're past halfway.");
    expect(giverLine(card({ state: "closed", heads: [head({ closed: true, verdict: "defeated" })] }), null)).toBe("We took it down! Thank you, party.");
    expect(giverLine(card({ state: "closed", heads: [head({ closed: true, verdict: "got_away" })] }), null)).toBe("The slime got away this time. Fine, we'll get the next one.");
    expect(giverLine(card({ hp: 90 }), { name: "Member A", mine: false })).toBe("Member A landed one! Who's next?");
  });

  it("counts a Hydra's heads down, and only heads", () => {
    const heads = [head({ id: "a", hp: 20 }), head({ id: "b", hp: 80 })];
    expect(headsDownLine(heads)).toBe("1 of 2 heads down");
    expect(hydraLine(card({ heads }))).toBe("A head is down! Keep the turn-ins coming.");
    expect(hydraLine(card({ heads: [head({ id: "a", hp: 10 }), head({ id: "b", hp: 0 })] }))).toBe("Every head is down. That's the whole ask done, as a team.");
  });

  it("keeps the Giver's mood about the bounty: sad only when it got away", () => {
    expect(giverMood(card({ hp: 100 }))).toBe("hopeful");
    expect(giverMood(card({ hp: 30 }))).toBe("delighted");
    expect(giverMood(card({ state: "closed", heads: [head({ closed: true, verdict: "got_away" })] }))).toBe("sad");
  });

  it("grows the summoned monster with the Party called, and makes a Hydra from two heads", () => {
    expect(monsterPreview(0, 1).monster).toBe("slime");
    expect(monsterPreview(5, 1).name).toBe("Big slime");
    expect(monsterPreview(28, 1).monster).toBe("dragon");
    expect(monsterPreview(5, 3)).toEqual({ monster: "hydra", name: "3-headed Hydra", line: null });
  });

  it("says in the preview whether the bounty will be required or optional", () => {
    expect(summonRule(true)).toBe("Required for everyone called");
    expect(summonRule(false)).toBe("Optional: people accept it to join");
  });

  it("offers a called reader on an optional bounty Accept and Decline, then Turn in and Hand back once accepted", () => {
    const called = card({ heads: [head({ mine: mine("called") })] });
    expect([canAccept(called, NOW), canDecline(called, NOW), canTurnIn(called, called.heads[0], NOW), canHandBack(called, called.heads[0], NOW)]).toEqual([true, true, true, false]);
    const accepted = card({ heads: [head({ mine: mine("accepted") })] });
    expect([canAccept(accepted, NOW), canTurnIn(accepted, accepted.heads[0], NOW), canHandBack(accepted, accepted.heads[0], NOW)]).toEqual([false, true, true]);
    expect(movesHint(called, NOW)).toBe("Accept it and we'll remind you before it closes.");
    expect(movesHint(accepted, NOW)).toBeNull();
  });

  it("offers a required bounty's reader only Turn in, and says plainly once that it is required", () => {
    for (const standing of ["called", "accepted"] as const) {
      const req = card({ required: true, heads: [head({ mine: mine(standing) })] });
      expect([canAccept(req, NOW), canDecline(req, NOW), canTurnIn(req, req.heads[0], NOW), canHandBack(req, req.heads[0], NOW)]).toEqual([false, false, true, false]);
      expect(movesHint(req, NOW)).toBe("From Member A, required. Turn it in, late if you must.");
    }
  });

  it("takes a late Turn-in after a head closes, lets a hand-back turn in while the head is open, and takes none once withdrawn", () => {
    const missed = card({ state: "closed", heads: [head({ closed: true, mine: mine("missed") })] });
    expect([canAccept(missed, NOW), canTurnIn(missed, missed.heads[0], NOW), canHandBack(missed, missed.heads[0], NOW)]).toEqual([false, true, false]);
    const back = card({ heads: [head({ mine: mine("handed_back") })] });
    expect(canTurnIn(back, back.heads[0], NOW)).toBe(true);
    const done = card({ heads: [head({ mine: mine("turned_in") })] });
    expect([canTurnIn(done, done.heads[0], NOW), canHandBack(done, done.heads[0], NOW)]).toEqual([false, false]);
    const gone = card({ state: "withdrawn", heads: [head({ mine: mine("accepted") })] });
    expect(canTurnIn(gone, gone.heads[0], NOW)).toBe(false);
  });

  it("draws each lit face once across a Hydra's heads", () => {
    const a = { personId: "p-a", name: "Member A", initials: "MA" };
    const b = { personId: "p-b", name: "Member B", initials: "MB" };
    expect(litAcross(card({ heads: [head({ id: "1", lit: [a, b] }), head({ id: "2", lit: [b] })] }))).toEqual([a, b]);
  });

  it("keeps the season banner back until the company has a first count", () => {
    const zero = { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 };
    expect(seasonHasTally(zero)).toBe(false);
    expect(seasonHasTally({ ...zero, beacons: 1 })).toBe(true);
  });

  it("counts exactly the banner's four totals: hits, fires lit, Beacons lit and learnings, each enough alone (QS.14)", () => {
    const zero = { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 };
    for (const key of ["hits", "campfires", "beacons", "discoveries"] as const) expect(seasonHasTally({ ...zero, [key]: 1 })).toBe(true);
    // The season's name is not a count: a named season with no counts still waits.
    expect(seasonHasTally({ ...zero, name: "Q1 2027" })).toBe(false);
  });

  it("notes a Hydra chip on the Giver's party in heads, never people", () => {
    expect(headsInNote(1, 2)).toBe("1 of 2 heads");
    expect(headsInNote(0, 1)).toBeNull();
  });

  it("gives a person the same portrait tone wherever they appear", () => {
    expect(portraitTone("p-1")).toBe(portraitTone("p-1"));
    expect(portraitTone("p-1")).toBeGreaterThanOrEqual(0);
    expect(portraitTone("p-1")).toBeLessThan(12);
  });

});

describe("the Quests UI", () => {
  const dir = new URL(".", import.meta.url).pathname;
  const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts")).map((f) => [f, readFileSync(join(dir, f), "utf8")] as const);
  // What a component can put on the page: its code, without the comments that explain it.
  const code = sources.map(([f, s]) => [f, s.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n")] as const);

  it("never reaches the service-role client, so every component can render without a database", () => {
    expect(sources.filter(([, s]) => s.includes("@/kernel/data/supabase")).map(([f]) => f)).toEqual([]);
  });

  it("never counts who is still out: no 'x of y' and no 'still out' on the page", () => {
    // The one count of that shape is a Hydra's heads down, said by headsDownLine and tested above.
    expect(code.filter(([, s]) => /\} of \{|still out/.test(s)).map(([f]) => f)).toEqual([]);
  });

  it("never scores a hit: no critical hits and no damage numbers anywhere in the UI", () => {
    expect(sources.filter(([, s]) => /critical|damage|−\{|-\{[^}]*\}%/i.test(s)).map(([f]) => f)).toEqual([]);
  });
});
