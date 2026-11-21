import { describe, expect, it, vi } from "vitest";

// Which asks the Asks page keeps once they close (AK.8; spec story 15, "answer
// after the due date and still count", and story 23, "read every answer on the
// page"). shapeAsksPage is pure, so the rules are tested on rows in memory; the
// page test covers what renders and the read's query. Names are invented.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());

const { shapeAsksPage } = await import("./asks-read");
type Data = Parameters<typeof shapeAsksPage>[0];

// Wednesday 18 November 2026, 10:00 in Saigon.
const NOW = new Date("2026-11-18T03:00:00.000Z");

const quest = (id: string, giver: string, required: boolean, state: "open" | "closed" | "withdrawn", closedAt: string | null = null) => ({
  id, kind: "bounty" as const, title: `Ask ${id}`, ask: "", giver_id: giver, state, learning: false, required, closing_date: null, closed_at: closedAt, created_at: "2026-11-01T03:00:00.000Z",
});
const head = (id: string, questId: string, closesAt: string, closedAt: string | null) => ({ id, quest_id: questId, position: 0, ask: `Ask ${questId}`, closes_at: closesAt, closed_at: closedAt });
const row = (id: string, questId: string, headId: string, personId: string, standing: string, extra: Record<string, unknown> = {}) => ({
  id, quest_id: questId, head_id: headId, person_id: personId, standing, late: false,
  accepted_at: null, turned_in_at: null, handed_back_at: null, missed_at: null, turn_in_text: null, turn_in_url: null, ...extra,
});

function page(parts: { quests: ReturnType<typeof quest>[]; heads: ReturnType<typeof head>[]; party: ReturnType<typeof row>[] }) {
  const data = { ...parts, answeredOn: new Map(), thanked: new Set<string>(), names: new Map([["lead", "Lena Lead"], ["ari", "Ari Answer"]]) } as unknown as Data;
  return shapeAsksPage(data, "me", NOW);
}

/** A required ask of the reader that closed at `closedAt`, with the reader's row in `standing`. */
const closedAskOfMe = (id: string, closedAt: string, standing: string, required = true, state: "closed" | "withdrawn" = "closed") => ({
  quests: [quest(id, "lead", required, state, closedAt)],
  heads: [head(`h${id}`, id, closedAt, closedAt)],
  party: [row(`p${id}`, id, `h${id}`, "me", standing)],
});

describe("an ask made of the reader, once it closes", () => {
  it("stays for two weeks while the reader has not answered, so they can still answer it", () => {
    const shown = page(closedAskOfMe("q1", "2026-11-16T11:00:00.000Z", "missed"));
    expect(shown.waiting).toEqual([]);
    expect(shown.closed).toEqual([{ kind: "of_you", closedAt: "2026-11-16T11:00:00.000Z", ask: expect.objectContaining({ questId: "q1", headId: "hq1", asker: expect.objectContaining({ name: "Lena Lead" }) }) }]);
  });

  it("leaves the page once two weeks have passed since it closed", () => {
    expect(page(closedAskOfMe("q1", "2026-11-05T03:00:00.000Z", "missed")).closed).toHaveLength(1);
    expect(page(closedAskOfMe("q1", "2026-11-03T03:00:00.000Z", "missed")).closed).toEqual([]);
  });

  it("leaves at once when nobody expected an answer, when the reader answered or declined, and when it was withdrawn", () => {
    const at = "2026-11-16T11:00:00.000Z";
    expect(page(closedAskOfMe("q1", at, "called", false)).closed).toEqual([]);
    expect(page(closedAskOfMe("q1", at, "turned_in")).closed).toEqual([]);
    expect(page(closedAskOfMe("q1", at, "handed_back")).closed).toEqual([]);
    expect(page(closedAskOfMe("q1", at, "accepted", true, "withdrawn")).closed).toEqual([]);
  });

  it("counts as closed from its due time, before the clock has closed it", () => {
    // Due five minutes ago: the quest is still open until the clock's next run.
    const due = "2026-11-18T02:55:00.000Z";
    const shown = page({ quests: [quest("q1", "lead", true, "open")], heads: [head("hq1", "q1", due, null)], party: [row("pq1", "q1", "hq1", "me", "accepted")] });
    expect(shown.waiting).toEqual([]);
    expect(shown.closed.map((c) => [c.kind, c.closedAt])).toEqual([["of_you", due]]);
  });
});

describe("an ask the reader made, once it closes", () => {
  const closedAt = "2026-11-13T11:00:00.000Z";
  const mine = {
    quests: [quest("qm", "me", false, "closed", closedAt)],
    heads: [head("hqm", "qm", closedAt, closedAt)],
    party: [
      row("p1", "qm", "hqm", "ari", "turned_in", { turned_in_at: "2026-11-12T03:00:00.000Z", turn_in_text: "Use the client's own words." }),
      row("p2", "qm", "hqm", "oz", "called"),
    ],
  };

  it("moves from You asked to the closed list with its answers, and no longer offers Withdraw", () => {
    const shown = page(mine);
    expect(shown.asked).toEqual([]);
    expect(shown.closed).toHaveLength(1);
    const [only] = shown.closed;
    expect(only.kind).toBe("you_made");
    if (only.kind !== "you_made") return;
    expect(only.closedAt).toBe(closedAt);
    expect(only.ask).toMatchObject({ asked: 2, answered: 1, canWithdraw: false });
    expect(only.ask.answers.map((a) => [a.who.personId, a.text, a.canThank])).toEqual([["ari", "Use the client's own words.", true]]);
  });

  it("is not listed as an ask made of the reader too, when the reader was on its party", () => {
    // Required, so the reader's own Missed row would otherwise qualify for a late answer.
    const shown = page({ quests: [quest("qm", "me", true, "closed", closedAt)], heads: mine.heads, party: [...mine.party, row("p3", "qm", "hqm", "me", "missed")] });
    expect(shown.closed.map((c) => c.kind)).toEqual(["you_made"]);
  });
});

describe("an ask the reader made, while it is open", () => {
  // The New ask drawer never asks the asker, so only a hand-made call could put
  // the reader on their own party; the page still lists the ask once (AK.11).
  const due = "2026-11-20T11:00:00.000Z";
  it.each([
    ["required", true, "accepted"],
    ["optional", false, "called"],
  ] as const)("is listed once, under You asked, when the reader is on their own %s ask's party", (_kind, required, standing) => {
    const shown = page({
      quests: [quest("qm", "me", required, "open")],
      heads: [head("hqm", "qm", due, null)],
      party: [row("p1", "qm", "hqm", "ari", standing), row("p2", "qm", "hqm", "me", standing)],
    });
    expect(shown.asked.map((a) => a.questId)).toEqual(["qm"]);
    expect(shown.waiting).toEqual([]);
    expect(shown.open).toEqual([]);
  });
});

it("lists the closed asks newest first", () => {
  const older = closedAskOfMe("q1", "2026-11-10T11:00:00.000Z", "missed");
  const newer = closedAskOfMe("q2", "2026-11-16T11:00:00.000Z", "missed");
  const shown = page({ quests: [...older.quests, ...newer.quests], heads: [...older.heads, ...newer.heads], party: [...older.party, ...newer.party] });
  expect(shown.closed.map((c) => c.ask.questId)).toEqual(["q2", "q1"]);
});
