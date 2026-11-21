import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAccess, type RoleHolding, type RolePermission, type Scope } from "@/kernel/identity/access-model";
import { permissions } from "../permissions";
import { readQuestReport, shapeQuestReport, shapeReportQuests, type ReportData, type ReportReader } from "./quest-report";
import { shapeAsksPage, type AsksData } from "./asks-read";
import type { HeadRow, PartyDbRow, QuestRow } from "./rows";
import type { Standing } from "./standing";

// ADR 0020's visibility matrix over the three audiences (QS.3; spec
// 2026-10-20, "One read model, three audiences" and Testing Decisions). Six
// readers open the same two closed Bounties, on rows in memory:
//
//   member      a team member who missed both of them
//   peer        a team member who turned in on both
//   giver       a team member who gave the optional Bounty, a manager of nobody
//   manager     the member's manager, who gave neither
//   mgrGiver    a manager who gave the required Bounty; manages only `late`
//   admin       sees everyone
//
// Each reader's access is resolved by the kernel's own rule from the holders
// quests/permissions.ts declares for quests.report, so the matrix follows the
// declaration rather than a copy of it.

const NOW = new Date("2026-10-27T03:00:00Z");

const NAMES = new Map([
  ["member", "Anh Member"],
  ["peer", "Binh Peer"],
  ["giver", "Chi Giver"],
  ["manager", "Dung Manager"],
  ["mgrGiver", "Em Manager"],
  ["admin", "Giang Admin"],
  ["late", "Hai Late"],
  ["handed", "Khanh Handed"],
  ["quiet", "Lan Quiet"],
]);

const quest = (id: string, giver: string, required: boolean, over: Partial<QuestRow> = {}): QuestRow => ({
  id,
  kind: "bounty",
  title: id === "q-req" ? "Send your flight times" : "One prompt that saved you an hour",
  ask: "",
  giver_id: giver,
  state: "closed",
  learning: false,
  required,
  closing_date: "2026-10-24",
  closed_at: "2026-10-24T10:00:00Z",
  created_at: "2026-10-20T03:00:00Z",
  ...over,
});

const QUESTS = [quest("q-req", "mgrGiver", true), quest("q-opt", "giver", false, { created_at: "2026-10-21T03:00:00Z" })];

const HEADS: HeadRow[] = [
  { id: "r1", quest_id: "q-req", position: 1, ask: "Flight there", closes_at: "2026-10-22T10:00:00Z", closed_at: "2026-10-22T10:00:00Z" },
  { id: "r2", quest_id: "q-req", position: 2, ask: "Flight home", closes_at: "2026-10-24T10:00:00Z", closed_at: "2026-10-24T10:00:00Z" },
  { id: "o1", quest_id: "q-opt", position: 1, ask: "One prompt", closes_at: "2026-10-24T10:00:00Z", closed_at: "2026-10-24T10:00:00Z" },
];

let n = 0;
const row = (questId: string, headId: string, person: string, standing: Standing, late = false): PartyDbRow => ({
  id: `p${++n}`,
  quest_id: questId,
  head_id: headId,
  person_id: person,
  standing,
  late,
  accepted_at: "2026-10-20T04:00:00Z",
  turned_in_at: standing === "turned_in" ? (late ? "2026-10-25T03:00:00Z" : "2026-10-21T03:00:00Z") : null,
  handed_back_at: standing === "handed_back" ? "2026-10-21T03:00:00Z" : null,
  missed_at: standing === "missed" || late ? "2026-10-22T10:00:00Z" : null,
  turn_in_text: standing === "turned_in" ? "Done" : null,
});

// The member missed a head of each Bounty; `late` was Missed and lifted it with
// a late Turn-in; `quiet` never opted in to the optional one, so stays Called.
const PARTY: PartyDbRow[] = [
  row("q-req", "r1", "member", "missed"),
  row("q-req", "r2", "member", "turned_in"),
  row("q-req", "r1", "peer", "turned_in"),
  row("q-req", "r2", "peer", "turned_in"),
  row("q-req", "r1", "late", "turned_in", true),
  row("q-req", "r2", "late", "missed"),
  row("q-opt", "o1", "member", "missed"),
  row("q-opt", "o1", "peer", "turned_in"),
  row("q-opt", "o1", "late", "turned_in"),
  row("q-opt", "o1", "handed", "handed_back"),
  row("q-opt", "o1", "quiet", "called"),
];

/** The holders quests/permissions.ts declares, as role permissions: "manager:team, admin" is manager at team and admin at all. */
function declaredHolders(atom: string): RolePermission[] {
  return permissions.holders[atom]!.split(",").map((h) => {
    const [role, scope] = h.trim().split(":");
    return { role: role!, permission: atom, scope: (scope ?? "all") as Scope };
  });
}
const ROLE_PERMISSIONS = [...declaredHolders("quests.report"), ...declaredHolders("quests.mine")];

function readerOf(personId: string, roles: string[], reportIds: string[] = []): ReportReader {
  const holdings: RoleHolding[] = roles.map((role) => ({ role, because: "test" }));
  return { personId, access: resolveAccess(holdings, ROLE_PERMISSIONS, { personId, reportIds, clientIds: [] }) };
}

const READERS = {
  member: readerOf("member", ["team-member"]),
  peer: readerOf("peer", ["team-member"]),
  giver: readerOf("giver", ["team-member"]),
  manager: readerOf("manager", ["team-member", "manager"], ["member"]),
  mgrGiver: readerOf("mgrGiver", ["team-member", "manager"], ["late"]),
  admin: readerOf("admin", ["team-member", "admin"]),
} as const;
type ReaderName = keyof typeof READERS;
const NAMES_OF_READERS = Object.keys(READERS) as ReaderName[];

const DATA_OF = (questId: string): ReportData => ({ quest: QUESTS.find((q) => q.id === questId) ?? null, heads: HEADS, party: PARTY, names: NAMES });
const reportFor = (reader: ReaderName, questId: string) => shapeQuestReport(READERS[reader], questId, DATA_OF(questId), NOW)!;
const seen = (reader: ReaderName, questId: string) => reportFor(reader, questId).rows.map((r) => r.personId).sort();

describe("ADR 0020's matrix: the manager audience", () => {
  // Who each reader reaches on each Bounty. Nobody without quests.report
  // reaches anyone, a non-manager Giver on their own Bounty included.
  const MATRIX: Record<ReaderName, { "q-req": string[]; "q-opt": string[] }> = {
    member: { "q-req": [], "q-opt": [] },
    peer: { "q-req": [], "q-opt": [] },
    giver: { "q-req": [], "q-opt": [] },
    manager: { "q-req": ["member"], "q-opt": ["member"] },
    // Their required Bounty's whole party, but on someone else's only their own report.
    mgrGiver: { "q-req": ["late", "member", "peer"], "q-opt": ["late"] },
    admin: { "q-req": ["late", "member", "peer"], "q-opt": ["handed", "late", "member", "peer", "quiet"] },
  };

  it.each(NAMES_OF_READERS.flatMap((r) => (["q-req", "q-opt"] as const).map((q) => ({ reader: r, quest: q, expected: MATRIX[r][q] }))))(
    "$reader on $quest reaches $expected",
    ({ reader, quest: q, expected }) => {
      expect(seen(reader, q)).toEqual(expected);
    },
  );

  it("says each Standing as the row has it, per head: Missed, a late Turn-in, Turned in, Handed back and Called", () => {
    const req = reportFor("admin", "q-req");
    expect(req.heads.map((h) => h.ask)).toEqual(["Flight there", "Flight home"]);
    const byPerson = new Map(req.rows.map((r) => [r.personId, r.heads]));
    expect(byPerson.get("member")).toEqual([{ standing: "missed", late: false }, { standing: "turned_in", late: false }]);
    // A late Turn-in lifted the Missed on head 1; head 2 is still Missed.
    expect(byPerson.get("late")).toEqual([{ standing: "turned_in", late: true }, { standing: "missed", late: false }]);
    const opt = new Map(reportFor("admin", "q-opt").rows.map((r) => [r.personId, r.heads[0]]));
    expect(opt.get("handed")).toEqual({ standing: "handed_back", late: false });
    // Never opted in to an optional Bounty, so never Missed on it.
    expect(opt.get("quiet")).toEqual({ standing: "called", late: false });
  });

  it("puts anyone with a Missed first, then the rest by name", () => {
    // Anh and Hai each missed a head; Binh turned in both.
    expect(reportFor("admin", "q-req").rows.map((r) => r.personId)).toEqual(["member", "late", "peer"]);
  });

  it("names the Giver and counts everyone called, as the party already sees, whoever the reader reaches", () => {
    const r = reportFor("manager", "q-req");
    expect(r.quest).toMatchObject({ title: "Send your flight times", giverName: "Em Manager", required: true, state: "closed" });
    expect(r.called).toBe(3);
  });

  it("gives a Withdrawn Bounty no Missed", () => {
    const withdrawn = { ...DATA_OF("q-req"), quest: { ...QUESTS[0]!, state: "withdrawn" as const } };
    const r = shapeQuestReport(READERS.admin, "q-req", withdrawn, NOW)!;
    expect(r.rows.flatMap((x) => x.heads).some((c) => c?.standing === "missed")).toBe(false);
  });

  it("leaves a head empty for someone not called on it", () => {
    const partial = { ...DATA_OF("q-req"), party: PARTY.filter((p) => !(p.person_id === "peer" && p.head_id === "r2")) };
    const peer = shapeQuestReport(READERS.admin, "q-req", partial, NOW)!.rows.find((r) => r.personId === "peer")!;
    expect(peer.heads).toEqual([{ standing: "turned_in", late: false }, null]);
  });

  it("answers no report for a quest that is not a Bounty", () => {
    const raid = { ...DATA_OF("q-req"), quest: { ...QUESTS[0]!, kind: "raid" as const } };
    expect(shapeQuestReport(READERS.admin, "q-req", raid, NOW)).toBeNull();
  });
});

describe("ADR 0020's matrix: the party audience", () => {
  const ASKS_DATA: AsksData = {
    quests: QUESTS,
    heads: HEADS,
    party: PARTY.map((p) => ({ ...p, turn_in_url: null })),
    answeredOn: new Map(),
    thanked: new Set(),
    names: NAMES,
  };

  it.each(NAMES_OF_READERS)("the Asks page carries no Standing word for %s, so no row still Missed is named", (reader) => {
    // The page names no Standing at all: an ask waits, is answered, or closed. So
    // the word cannot reach any reader, though a late answer can (the next case).
    expect(JSON.stringify(shapeAsksPage(ASKS_DATA, reader, NOW))).not.toMatch(/missed/i);
  });

  // A late answer says the person once missed the due time, so `late` reaches
  // only the asker, on the answers to an ask they made (ADR 0036 Consequences,
  // AK.9). Never on an ask made of the reader, where it would describe someone.
  it.each(NAMES_OF_READERS)("puts `late` only on the answers to an ask %s made", (reader) => {
    const page = shapeAsksPage(ASKS_DATA, reader, NOW);
    const ofYou = [...page.waiting, ...page.open, ...page.closed.flatMap((c) => (c.kind === "of_you" ? [c.ask] : []))];
    // The key, not the value: one fixture person's id is "late".
    expect(JSON.stringify(ofYou)).not.toMatch(/"late":/);
    const made = [...page.asked, ...page.closed.flatMap((c) => (c.kind === "you_made" ? [c.ask] : []))];
    for (const ask of made) expect(QUESTS.find((q) => q.id === ask.questId)!.giver_id).toBe(reader);
  });

  it("does tell the asker: the manager who asked sees Hai Late's late answer tagged late", () => {
    const page = shapeAsksPage(ASKS_DATA, "mgrGiver", NOW);
    const made = page.closed.flatMap((c) => (c.kind === "you_made" ? [c.ask] : []));
    const lateAnswers = made.flatMap((a) => a.answers.filter((x) => x.late).map((x) => ({ head: a.headId, text: x.text })));
    expect(lateAnswers).toEqual([{ head: "r1", text: "Done" }]);
  });
});

/** Every non-test source file of the quests entity. */
const ROOT = new URL("..", import.meta.url).pathname;
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * Every read of quest_party in a file, as the text of its chain: from
 * `selectQuestParty(` to the end of its statement, plus every later statement
 * that keeps filtering a builder the chain was assigned to (`const q =
 * selectQuestParty(…)…; q.eq("person_id", …)`).
 */
function partyReads(text: string): string[] {
  const reads: string[] = [];
  for (const m of text.matchAll(/selectQuestParty\(/g)) {
    const end = text.indexOf(";", m.index);
    let chain = text.slice(m.index, end === -1 ? undefined : end);
    const assigned = /(?:const|let)\s+(\w+)\s*=\s*$/.exec(text.slice(Math.max(0, m.index - 80), m.index));
    if (assigned) for (const more of text.slice(end).matchAll(new RegExp(`\\b${assigned[1]}\\.[^;]*`, "g"))) chain += more[0];
    reads.push(chain);
  }
  return reads;
}

/** A read is about one quest when it filters on one quest_id. */
const oneQuest = (chain: string) => /\.eq\(\s*"quest_id"/.test(chain);
/**
 * A read cannot return a Missed when it selects no standing (its columns are a
 * literal without one; a named constant such as PARTY_COLUMNS is assumed to
 * carry it), or when it keeps only Standings that are not one.
 */
const noMissed = (chain: string) => {
  const columns = /^selectQuestParty\(\s*"([^"]*)"/.exec(chain)?.[1];
  if (columns !== undefined && !columns.includes("standing")) return true;
  const kept = /\.eq\(\s*"standing",\s*"(\w+)"\)/.exec(chain)?.[1] ?? /\.in\(\s*"standing",\s*\[([^\]]*)\]/.exec(chain)?.[1];
  return kept !== undefined && !kept.includes("missed");
};

/**
 * The reads of quest_party that span quests and keep every Standing, so their
 * rows can carry a Missed from more than one quest, and the audience that
 * makes each safe. Each audience is proven above: the Asks page has no field
 * that names a Missed.
 * A new such read fails until it is added here with its audience and a test.
 * The scan covers entities/quests only. The ladders entity reads a person's
 * party rows across quests too, through this entity's door (acts.ts and
 * act-facts.ts, which the scan does read), and those keep only Turned-in and
 * Accepted rows, so they carry no Missed.
 */
const SPANNING_READS: Record<string, string> = {
  "lib/quests-read.ts": "the party audience: allPartyRows is the paged read asks-read.ts shapes, and the page it builds has no Standing that names a Missed",
  // The quest clock (QS.2) is no audience: it reads the party rows of the heads due
  // now so it can write each owed Missed and send each person their own reminder.
  // It returns nothing to a reader and states no fact that names who missed.
  "lib/quest-clock.ts": "the quest clock: writes Missed head by head and shows it to nobody",
  // The Asks page (AK.8) reads the reader's own Missed rows on required asks that
  // closed in the last two weeks, so they can still answer late. They are the
  // reader's own rows, and the page it builds has no Standing that names a Missed
  // (the matrix above shapes it for every reader).
  "lib/asks-read.ts": "the reader's own rows: a Missed of their own, on an ask that still takes their late answer",
};

describe("every read of Missed is about one quest (ADR 0020)", () => {
  it("lets no read of quest_party span quests with every Standing, except the audiences that shape it away and the clock that writes it", () => {
    const spanning = sources(ROOT).flatMap((file) =>
      partyReads(readFileSync(file, "utf8"))
        .filter((chain) => !oneQuest(chain) && !noMissed(chain))
        .map(() => file.slice(ROOT.length)),
    );
    expect([...new Set(spanning)].sort()).toEqual(Object.keys(SPANNING_READS).sort());
  });

  it("finds a spanning read when one is written, so the scan above is not decorative", () => {
    const bad = `const rows = mustRows(await selectQuestParty("person_id, standing").in("person_id", ids), "x");`;
    const split = `const q = selectQuestParty("person_id, standing");\nconst r = await q.eq("standing", "missed").in("person_id", ids);`;
    expect(partyReads(bad).filter((c) => !oneQuest(c) && !noMissed(c))).toHaveLength(1);
    expect(partyReads(split).filter((c) => !oneQuest(c) && !noMissed(c))).toHaveLength(1);
    expect(partyReads(`selectQuestParty("x").eq("standing", "turned_in").in("person_id", ids);`).filter((c) => !oneQuest(c) && !noMissed(c))).toHaveLength(0);
  });

  it("counts no Missed anywhere in the entity", () => {
    const counting = /(?:===?\s*"missed"[^;\n]*\)\s*\.length|\bcount\w*\b[^;\n]*"missed"|"missed"[^;\n]*\bcount\w*\b|reduce\([^;\n]*"missed")/;
    const found = sources(ROOT).filter((f) => counting.test(readFileSync(f, "utf8"))).map((f) => f.slice(ROOT.length));
    expect(found).toEqual([]);
  });

  it("answers about the asked quest alone when rows of another are handed in", () => {
    const both: ReportData = { quest: QUESTS[1]!, heads: HEADS, party: PARTY, names: NAMES };
    const r = shapeQuestReport(READERS.admin, "q-opt", both, NOW)!;
    expect(r.heads.map((h) => h.id)).toEqual(["o1"]);
    expect(r.called).toBe(5);
    // The member is on both, and missed both; one quest's report has one Missed for them.
    expect(r.rows.find((x) => x.personId === "member")!.heads).toEqual([{ standing: "missed", late: false }]);
    // Asking for a quest the rows do not hold answers nothing rather than another quest.
    expect(shapeQuestReport(READERS.admin, "q-req", both, NOW)).toBeNull();
  });

  it("refuses a quest id that is not one without reading anything", async () => {
    await expect(readQuestReport(READERS.admin, "all")).resolves.toBeNull();
    await expect(readQuestReport(READERS.admin, "")).resolves.toBeNull();
  });

  it("offers open and closed Bounties in the picker, newest first, and names nobody", () => {
    const options = shapeReportQuests([
      { id: "a", kind: "bounty", title: "Older", state: "closed", created_at: "2026-10-01T00:00:00Z", closed_at: "2026-10-03T10:00:00Z" },
      { id: "b", kind: "bounty", title: "Newer", state: "open", created_at: "2026-10-20T00:00:00Z", closed_at: null },
      { id: "c", kind: "bounty", title: "Taken back", state: "withdrawn", created_at: "2026-10-21T00:00:00Z", closed_at: null },
      { id: "d", kind: "raid", title: "A fire", state: "open", created_at: "2026-10-22T00:00:00Z", closed_at: null },
    ]);
    expect(options.map((o) => o.id)).toEqual(["b", "a"]);
    expect(Object.keys(options[0]!).sort()).toEqual(["closedAt", "createdAt", "id", "state", "title"]);
  });
});
