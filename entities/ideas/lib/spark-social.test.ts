import { describe, expect, it } from "vitest";
import { cameBackFor, checkInFor, deckFor, joinNames, socialByIdea, sparkStage, stagesReached, type BuildRow, type IdeaRef, type ReactionRow } from "./spark-social";

const idea = (id: string, person_id: string, created_at: string, kind = "build"): IdeaRef => ({ id, person_id, kind, title: `T-${id}`, created_at });
const react = (ideaId: string, personId: string, kind: ReactionRow["kind"], createdAt = "2026-10-01"): ReactionRow => ({ ideaId, personId, name: personId.toUpperCase(), kind, createdAt });
const build = (ideaId: string, personId: string, createdAt = "2026-10-02"): BuildRow => ({ id: `b-${ideaId}-${personId}`, ideaId, personId, name: personId.toUpperCase(), body: "Same here.", createdAt });

describe("socialByIdea", () => {
  it("lists admirers and me-toos as faces, counts builds, and leaves skips and check-ins out", () => {
    const s = socialByIdea(
      [react("i1", "a", "admire", "2026-10-02"), react("i1", "b", "admire", "2026-10-01"), react("i1", "c", "me_too"), react("i1", "d", "skip"), react("i1", "e", "held")],
      [build("i1", "f"), build("i1", "g")],
    ).get("i1")!;
    expect(s.admirers.map((f) => f.personId)).toEqual(["b", "a"]);
    expect(s.meToo.map((f) => f.personId)).toEqual(["c"]);
    expect(s.builds).toBe(2);
  });
});

describe("joinNames", () => {
  it("reads as a sentence", () => {
    expect(joinNames(["Hà"])).toBe("Hà");
    expect(joinNames(["Quân", "Ethan"])).toBe("Quân and Ethan");
    expect(joinNames(["Quân", "Ethan", "Hà", "Derek"])).toBe("Quân, Ethan and 2 more");
  });
});

describe("deckFor", () => {
  const ideas = [
    idea("d1", "derek", "2026-10-07"),
    idea("d2", "derek", "2026-10-06"),
    idea("d3", "derek", "2026-10-05"),
    idea("h1", "ha", "2026-09-25"),
    idea("e1", "ethan", "2026-09-20"),
    idea("k1", "khoa", "2026-10-07"),
  ];

  it("never serves the person's own sparks or one they answered, skipped or built on", () => {
    const deck = deckFor("khoa", ideas, [react("d1", "khoa", "admire"), react("d2", "khoa", "skip")], [build("d3", "khoa")]);
    expect(deck.map((i) => i.id)).toEqual(["h1", "e1"]);
  });

  it("takes one author at a time, so a prolific author cannot fill the deck", () => {
    expect(deckFor("khoa", ideas, [], []).map((i) => i.id)).toEqual(["d1", "h1", "e1"]);
  });

  it("serves the sparks fewest teammates have answered first; a skip counts as no answer", () => {
    const answered = [react("d1", "ha", "admire"), react("d1", "ethan", "me_too"), react("h1", "derek", "skip")];
    expect(deckFor("khoa", ideas, answered, [], 2).map((i) => i.id)).toEqual(["d2", "h1"]);
  });

  it("fills from the same author once the others are used up", () => {
    const only = ideas.filter((i) => i.person_id === "derek");
    expect(deckFor("khoa", only, [], []).map((i) => i.id)).toEqual(["d1", "d2", "d3"]);
  });
});

describe("cameBackFor", () => {
  const ideas = [idea("k1", "khoa", "2026-10-01"), idea("k2", "khoa", "2026-10-02", "learning"), idea("d1", "derek", "2026-10-03")];

  it("groups answers per spark and kind, quotes builds, newest first", () => {
    const back = cameBackFor(
      "khoa",
      ideas,
      [react("k1", "quan", "admire", "2026-10-04"), react("k1", "derek", "admire", "2026-10-05"), react("k2", "ha", "me_too", "2026-10-03")],
      [build("k1", "thanh", "2026-10-06")],
    );
    expect(back.map((b) => [b.who.join("+"), b.line, b.ideaId, b.quote])).toEqual([
      ["THANH", "built on", "k1", "Same here."],
      ["QUAN+DEREK", "admire", "k1", null],
      ["HA", "will try", "k2", null],
    ]);
  });

  it("leaves out the person's own answers, other people's sparks, skips and 'still trying'", () => {
    const back = cameBackFor(
      "khoa",
      ideas,
      [react("k1", "khoa", "admire"), react("d1", "quan", "admire"), react("k1", "ha", "skip"), react("k2", "ha", "trying")],
      [build("k1", "khoa"), build("d1", "ha")],
    );
    expect(back).toEqual([]);
  });

  it("says has-hit-this-too for one person on an idea to build", () => {
    expect(cameBackFor("khoa", ideas, [react("k1", "ha", "me_too")], [])[0].line).toBe("has hit this too:");
  });
});

describe("stagesReached (W.185)", () => {
  it("lights a stage only when its own fact holds, so a picked-up spark with no builds was never echoed", () => {
    expect([...stagesReached(0, [{ status: "open" }])]).toEqual(["spark", "picked_up"]);
    expect([...stagesReached(2, [])]).toEqual(["spark", "echoed"]);
    expect([...stagesReached(0, [{ status: "done" }])]).toEqual(["spark", "picked_up", "shipped"]);
    expect([...stagesReached(0, [{ status: "not_doing" }])]).toEqual(["spark"]);
  });
});

describe("sparkStage (ID.2.8)", () => {
  it("moves on one action each: a build echoes, an open card picks up, a done card ships", () => {
    expect(sparkStage(0, [])).toBe("spark");
    expect(sparkStage(2, [])).toBe("echoed");
    expect(sparkStage(0, [{ status: "open" }])).toBe("picked_up");
    expect(sparkStage(1, [{ status: "open" }, { status: "done" }])).toBe("shipped");
  });

  it("does not count a card set aside as picked up", () => {
    expect(sparkStage(1, [{ status: "not_doing" }])).toBe("echoed");
  });
});

describe("checkInFor (ID.2.9)", () => {
  const now = new Date("2026-10-30T00:00:00Z");
  const ideas = [idea("l1", "ha", "2026-09-01", "learning"), idea("l2", "quan", "2026-09-02", "learning"), idea("b1", "derek", "2026-09-03")];

  it("asks about the oldest learning the person said they'd try two weeks or more ago", () => {
    const r = [react("l2", "khoa", "me_too", "2026-10-01T00:00:00Z"), react("l1", "khoa", "me_too", "2026-10-05T00:00:00Z")];
    expect(checkInFor("khoa", ideas, r, now)?.id).toBe("l2");
  });

  it("waits two weeks, never asks about an idea to build, and stops once it held or didn't stick", () => {
    expect(checkInFor("khoa", ideas, [react("l1", "khoa", "me_too", "2026-10-20T00:00:00Z")], now)).toBeNull();
    expect(checkInFor("khoa", ideas, [react("b1", "khoa", "me_too", "2026-09-10T00:00:00Z")], now)).toBeNull();
    const held = [react("l1", "khoa", "me_too", "2026-09-10T00:00:00Z"), react("l1", "khoa", "held", "2026-09-30T00:00:00Z")];
    expect(checkInFor("khoa", ideas, held, now)).toBeNull();
  });

  it("asks again two weeks after 'still trying'", () => {
    const base = react("l1", "khoa", "me_too", "2026-09-10T00:00:00Z");
    expect(checkInFor("khoa", ideas, [base, react("l1", "khoa", "trying", "2026-10-25T00:00:00Z")], now)).toBeNull();
    expect(checkInFor("khoa", ideas, [base, react("l1", "khoa", "trying", "2026-10-10T00:00:00Z")], now)?.id).toBe("l1");
  });
});

describe("cameBackFor · check-in answers", () => {
  it("tells the author when a teammate says it held or didn't stick, never 'still trying'", () => {
    const ideas = [idea("k1", "khoa", "2026-09-01", "learning")];
    const back = cameBackFor("khoa", ideas, [react("k1", "ha", "held", "2026-10-02"), react("k1", "quan", "unstuck", "2026-10-03"), react("k1", "thanh", "trying", "2026-10-04")], []);
    expect(back.map((b) => `${b.who[0]} ${b.line}`)).toEqual(["QUAN tried it; it didn't stick:", "HA tried it, and it held:"]);
  });
});

describe("cameBackFor · picked up and shipped (ID.2.8)", () => {
  const ideas = [idea("k1", "khoa", "2026-09-01"), idea("k2", "khoa", "2026-09-02")];
  const card = (ideaId: string, status: string, assigneeId: string, createdAt: string, completedAt: string | null = null) => ({ ideaId, status, assigneeId, assigneeName: assigneeId.toUpperCase(), createdAt, completedAt });

  it("tells the author who picked their spark up, and when it shipped", () => {
    const back = cameBackFor("khoa", ideas, [], [], 4, [card("k1", "open", "thanh", "2026-10-02"), card("k2", "done", "ha", "2026-09-20", "2026-10-05")]);
    expect(back.map((b) => `${b.who[0]} ${b.line} ${b.ideaId}`)).toEqual(["HA shipped k2", "THANH picked up k1"]);
  });

  it("says nothing for a card set aside, or a spark the author picked up themselves", () => {
    expect(cameBackFor("khoa", ideas, [], [], 4, [card("k1", "not_doing", "thanh", "2026-10-02"), card("k2", "open", "khoa", "2026-10-03")])).toEqual([]);
  });
});
