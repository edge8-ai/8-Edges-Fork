import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATE, ME, card, hit, spark, times } from "../../lib/badge-fixtures";
import { recomputePerson, type Deps } from "../../lib/recompute";
import { replayAll } from "../../lib/replay";
import type { BadgeFound } from "../../lib/standing";
import { display, memoryDoors, memoryStore, type MemoryActs, type MemoryStore } from "../../lib/testing";

// The badge drops (LD.7b; the badges doc, section 5; ADR 0021): a badge drops
// on the page where the act that found it happened, to the person who did it,
// once; the replay's waits on the Achievements tab; several at once collapse;
// the two answers are equal; and nobody but the reader is ever answered.

let store: MemoryStore = memoryStore();
let access: { personId: string; impersonation?: unknown; may: (p: string, t?: { person?: string }) => boolean } | null = null;
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: async () => access, requirePermission: async () => undefined }));
vi.mock("../../lib/store", async (importActual) => {
  const actual = await importActual<typeof import("../../lib/store")>();
  return {
    ...actual,
    get liveStore() {
      return store;
    },
  };
});
vi.mock("../../lib/display-actions", () => ({ setDisplay: async () => ({ ok: true }) }));
vi.mock("../../lib/shown-actions", () => ({ markShown: async () => ({ ok: true }) }));

const { dropsFor, questDropFor, QUEST_SPOTS } = await import("./drops");
const { BADGES } = await import("../../lib/badges");
const { putInCase, keepInAchievements } = await import("./drop-answers");
const { BadgeDrop } = await import("./BadgeDrop");
const { badgeDrops, questBadgeDrops } = await import("./badge-drops");
const { Stickers, postcardStickers } = await import("./postcard-stickers");
const { myStanding } = await import("../../lib/standing");

const may = (who: string) => (p: string, t?: { person?: string }) => p === "ladders.mine" && (!t?.person || t.person === who);
const f = (key: string, over: Partial<BadgeFound> = {}): BadgeFound => ({ id: `u-${key}`, key, name: key, unlockedAt: "2026-10-23T19:00:00Z", shown: false, source: "event", witnessTable: "ideas", ...over });
const ok = async () => ({ ok: true as const });

beforeEach(() => {
  access = { personId: ME, may: may(ME) };
  store = memoryStore();
});

describe("where a badge drops", () => {
  it("drops on the page whose act wrote its witness, and nowhere else", () => {
    const found = [f("lorewright-i"), f("anvil-i", { witnessTable: "tasks" }), f("homework", { witnessTable: "training_submissions" }), f("hunter-i", { witnessTable: "quest_party" })];
    expect(dropsFor(found, "spark").map((d) => d.id)).toEqual(["lorewright-i"]);
    expect(dropsFor(found, "board").map((d) => d.id)).toEqual(["anvil-i"]);
    expect(dropsFor(found, "training").map((d) => d.id)).toEqual(["homework"]);
    // The Quests page asks its own slot, which stands the drop beside its act (below).
    expect(questDropFor(found)?.drops.map((d) => d.id)).toEqual(["lorewright-i", "hunter-i"]);
  });

  it("drops a badge once, and never one the replay found or the launch credited", () => {
    expect(dropsFor([f("lorewright-i", { shown: true })], "spark")).toEqual([]);
    expect(dropsFor([f("lorewright-i", { source: "replay" })], "spark")).toEqual([]);
    expect(dropsFor([f("lorewright-i", { source: "launch" })], "spark")).toEqual([]);
    // A badge proved by the tiers alone (Twin crowns) names no row and drops nowhere.
    expect(dropsFor([f("twin-crowns-i", { witnessTable: null })], "board")).toEqual([]);
  });

  it("drops Lorewright I under the composer when the member's next spark finds it", async () => {
    // A member with history: three Turn-ins, ten leaf cards and two learning sparks, credited quietly at the launch.
    const hits = times(3, () => hit());
    const cards = times(10, () => card());
    const sparks = times(2, () => spark());
    const acts: MemoryActs = {
      questFacts: { [ME]: { party: hits, given: [], hosted: [], reactionsGiven: [], reactionsReceived: [] } },
      sparkFacts: { [ME]: { sparks, marksGiven: [], buildNotes: [], heldReceived: [] } },
      cardFacts: { [ME]: cards },
    };
    const deps: Deps = { doors: memoryDoors(acts), store, now: () => new Date("2026-10-23T19:00:00Z") };
    await replayAll({ ...deps, teamPeople: async () => [ME, MATE] });
    const launched = (await myStanding({ personId: ME }, store)).badgesFound;
    expect(launched.map((b) => b.key)).toEqual(expect.arrayContaining(["hunter-i", "spark-struck", "anvil-i"]));
    expect(dropsFor(launched, "spark")).toEqual([]);
    // The next spark.
    const third = spark();
    acts.sparkFacts = { [ME]: { sparks: [...sparks, third], marksGiven: [], buildNotes: [], heldReceived: [] } };
    await recomputePerson(ME, "event", { ...deps, doors: memoryDoors(acts) });
    const drops = dropsFor((await myStanding({ personId: ME }, store)).badgesFound, "spark");
    expect(drops.map((d) => d.name)).toEqual(["Lorewright I"]);
    // It drops on Spark, and not on the board or My Training.
    const html = renderToStaticMarkup((await badgeDrops({ personId: ME }, "spark")) as ReactElement);
    expect(html).toContain("Badge found");
    expect(html).toContain("Lorewright I");
    expect(html).toContain('class="bd-fall"');
    expect(await badgeDrops({ personId: ME }, "board")).toBeNull();
    expect(await badgeDrops({ personId: ME }, "training")).toBeNull();
  });
});

describe("the Quests page's drop, beside the act that found it (QS.15b)", () => {
  it("stands a learning's badges by the composer, a fire's by the Campfires, a Beacon's on the horizon and a hit's under the arena", () => {
    expect(questDropFor([f("spark-struck"), f("first-page")])).toMatchObject({ spot: "learning", drops: [{ id: "spark-struck" }, { id: "first-page" }] });
    expect(questDropFor([f("fire-keeper-i", { witnessTable: "quests" })])).toMatchObject({ spot: "fire", drops: [{ id: "fire-keeper-i" }] });
    expect(questDropFor([f("lighthouse", { witnessTable: "quest_party" })])).toMatchObject({ spot: "beacon", drops: [{ id: "lighthouse" }] });
    expect(questDropFor([f("first-hit", { witnessTable: "quest_party" })])).toMatchObject({ spot: "hit", drops: [{ id: "first-hit" }] });
  });

  it("stands a badge beside the act its rule counts, even one the rail's own list leaves out", () => {
    expect(questDropFor([f("hydra-tamer-i", { witnessTable: "quest_party" })])).toMatchObject({ spot: "hit" });
    expect(questDropFor([f("first-hit", { witnessTable: "quest_party" }), f("dragons-scale", { witnessTable: "quest_party" })])).toMatchObject({ spot: "hit" });
    expect(questDropFor([f("carried-the-flame", { witnessTable: "quest_party" })])).toMatchObject({ spot: "beacon" });
    expect(questDropFor([f("seat-by-the-fire", { witnessTable: "quest_party" })])).toMatchObject({ spot: "fire" });
    expect(questDropFor([f("cold-fire-warm-hands", { witnessTable: "quests" })])).toMatchObject({ spot: "fire" });
    // A seat proved by Training's register drops on My Training, not here.
    expect(questDropFor([f("seat-by-the-fire", { witnessTable: "training_attendance" })])).toBeNull();
    // A learning with sources is not one the composer can post: Spark only.
    expect(questDropFor([f("footnotes")])).toBeNull();
  });

  it("names only badges and families the catalogue holds in its table of spots", () => {
    const names = new Set(BADGES.flatMap((b) => [b.id, ...(b.family ? [b.family] : [])]));
    for (const key of Object.keys(QUEST_SPOTS)) expect([key, names.has(key)]).toEqual([key, true]);
  });

  it("stands a badge no act on the page names under Your next move, and a set that spans acts there as one", () => {
    expect(questDropFor([f("tavern-keeper-i", { witnessTable: "quest_reactions" })])).toMatchObject({ spot: "other" });
    expect(questDropFor([f("three-paths", { witnessTable: "quest_party" })])).toMatchObject({ spot: "other" });
    const spanning = questDropFor([f("first-hit", { witnessTable: "quest_party" }), f("lighthouse", { witnessTable: "quest_party" })]);
    expect(spanning?.spot).toBe("other");
    expect(spanning?.drops.map((d) => d.id)).toEqual(["first-hit", "lighthouse"]);
  });

  it("never drops a Spark-only badge, the board's, Training's, a seen one or the replay's on Quests", () => {
    expect(questDropFor([f("stargazer-i")])).toBeNull();
    expect(questDropFor([f("anvil-i", { witnessTable: "tasks" })])).toBeNull();
    expect(questDropFor([f("homework", { witnessTable: "training_submissions" })])).toBeNull();
    expect(questDropFor([f("first-hit", { witnessTable: "quest_party", shown: true })])).toBeNull();
    expect(questDropFor([f("first-hit", { witnessTable: "quest_party", source: "replay" })])).toBeNull();
  });

  it("answers the reader alone, with Spark's star, and nothing to anyone else or in the assume view", async () => {
    store = memoryStore({ unlocks: [{ id: "u2", person_id: ME, kind: "badge", ladder: "learn_share", key: "lighthouse", unlocked_at: "2026-10-23T19:00:00Z", source: "event", shown_at: null, witness_table: "quest_party" }] });
    const drop = await questBadgeDrops({ personId: ME });
    expect(drop?.spot).toBe("beacon");
    expect(renderToStaticMarkup(drop?.node as ReactElement)).toContain('class="bd-chip"');
    expect(await questBadgeDrops({ personId: MATE })).toBeNull();
    access = { personId: ME, impersonation: { by: "admin" }, may: may(ME) };
    expect(await questBadgeDrops({ personId: ME })).toBeNull();
    access = { personId: ME, may: () => false };
    expect(await questBadgeDrops({ personId: ME })).toBeNull();
  });
});

describe("the slot answers the reader alone", () => {
  beforeEach(() => {
    store = memoryStore({ unlocks: [{ id: "u1", person_id: ME, kind: "badge", ladder: "builder", key: "heavy-lift-i", unlocked_at: "2026-10-23T19:00:00Z", source: "event", shown_at: null, witness_table: "tasks" }] });
  });

  it("draws the reader's own drop as the board's quiet line, linking to the Achievements tab", async () => {
    const html = renderToStaticMarkup((await badgeDrops({ personId: ME }, "board")) as ReactElement);
    expect(html).toContain('class="bd-line"');
    expect(html).toContain('Badge found: <a href="/team/profile?tab=achievements">Heavy lift I</a>');
    expect(html).not.toContain("bd-fall");
    expect(html).not.toContain("confetti");
  });

  it("answers nothing about anyone else, to a signed-out page, without ladders.mine, or in the assume view", async () => {
    expect(await badgeDrops({ personId: MATE }, "board")).toBeNull();
    access = { personId: MATE, may: may(MATE) };
    expect(await badgeDrops({ personId: ME }, "board")).toBeNull();
    access = null;
    expect(await badgeDrops({ personId: ME }, "board")).toBeNull();
    access = { personId: ME, may: () => false };
    expect(await badgeDrops({ personId: ME }, "board")).toBeNull();
    access = { personId: ME, impersonation: { by: "admin" }, may: may(ME) };
    expect(await badgeDrops({ personId: ME }, "board")).toBeNull();
  });

  it("draws nothing, rather than failing the page, when the reader's ladders cannot be read", async () => {
    const { ReadFailure } = await import("@/kernel/data/read");
    store = { ...store, unlocksOf: async () => { throw new ReadFailure("[ladders] ladder_unlocks", "down"); } } as MemoryStore;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await badgeDrops({ personId: ME }, "board")).toBeNull();
    spy.mockRestore();
  });
});

describe("the drop", () => {
  const drop = (id: string, name: string) => ({ unlockId: `u-${id}`, id, name, rarity: "uncommon" as const, glyph: "lift" as const, flavour: "A two-token stone, set in the wall." });

  it("collapses several at once into one 'n badges found' that opens onto the Achievements tab", () => {
    for (const style of ["spark", "quiet"] as const) {
      const html = renderToStaticMarkup(<BadgeDrop drops={[drop("a", "A"), drop("b", "B"), drop("c", "C")]} style={style} gameOn caseIds={[]} actions={{ setDisplay: ok, markShown: ok }} />);
      expect(html).toContain('<a href="/team/profile?tab=achievements">3 badges found</a>');
      expect(html).not.toContain("Put in my display case");
    }
  });

  it("offers the two equal answers, and says when the case is full", () => {
    const html = renderToStaticMarkup(<BadgeDrop drops={[drop("heavy-lift-i", "Heavy lift I")]} style="spark" gameOn caseIds={[]} actions={{ setDisplay: ok, markShown: ok }} />);
    expect(html).toContain(">Put in my display case</button>");
    expect(html).toContain(">Keep it in Achievements</button>");
    const full = renderToStaticMarkup(<BadgeDrop drops={[drop("heavy-lift-i", "Heavy lift I")]} style="quiet" gameOn caseIds={["a", "b", "c", "d", "e"]} actions={{ setDisplay: ok, markShown: ok }} />);
    expect(full).toContain('disabled="">Display case full</button>');
  });

  it("drops still, with no falling star, when the reader's game style is off", () => {
    const html = renderToStaticMarkup(<BadgeDrop drops={[drop("x", "X")]} style="spark" gameOn={false} caseIds={[]} actions={{ setDisplay: ok, markShown: ok }} />);
    expect(html).toContain("bd-drop--still");
  });

  it("puts the badge in the case and marks it seen; keeps it by marking it seen alone; a failed save marks nothing", async () => {
    const calls: string[] = [];
    const actions = {
      setDisplay: async (c: { displayCase?: string[] }) => (calls.push(`case:${c.displayCase?.join(",")}`), { ok: true as const }),
      markShown: async (ids: string[]) => (calls.push(`seen:${ids.join(",")}`), { ok: true as const }),
    };
    expect(await putInCase("heavy-lift-i", "u1", ["first-hit"], actions)).toEqual({ ok: true, caseIds: ["first-hit", "heavy-lift-i"] });
    expect(calls).toEqual(["case:first-hit,heavy-lift-i", "seen:u1"]);
    calls.length = 0;
    expect(await keepInAchievements(["u1"], actions)).toEqual({ ok: true });
    expect(calls).toEqual(["seen:u1"]);
    calls.length = 0;
    const failing = { ...actions, setDisplay: async () => ({ ok: false as const, error: "Your profile could not be saved. Try again." }) };
    expect(await putInCase("heavy-lift-i", "u1", [], failing)).toEqual({ ok: false, error: "Your profile could not be saved. Try again." });
    expect(calls).toEqual([]);
    expect((await putInCase("heavy-lift-i", "u1", ["a", "b", "c", "d", "e"], actions)).ok).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("the postcard's stickers", () => {
  it("are the first three of the display case, beside the hobbies, the same for the owner and a teammate", async () => {
    store = memoryStore({ display: [display({ person_id: ME, display_case: ["hunter-i", "spark-struck", "anvil-i", "first-hit", "first-strike"] })] });
    access = { personId: MATE, may: may(MATE) };
    const html = renderToStaticMarkup((await postcardStickers({ personId: ME })) as ReactElement);
    expect(html.match(/class="bd-st /g)).toHaveLength(3);
    for (const name of ["Hunter I", "Spark struck", "Anvil I"]) expect(html).toContain(name);
    for (const name of ["First hit", "First strike"]) expect(html).not.toContain(name);
    access = { personId: ME, may: may(ME) };
    expect(renderToStaticMarkup((await postcardStickers({ personId: ME })) as ReactElement)).toBe(html);
  });

  it("are none for an empty case: the slot answers nothing, so the postcard draws no Badges row", async () => {
    expect(renderToStaticMarkup(<Stickers displayCase={[]} />)).toBe("");
    store = memoryStore({ display: [display({ person_id: ME, display_case: [] })] });
    expect(await postcardStickers({ personId: ME })).toBeNull();
    // A case naming only badges the catalogue no longer holds is empty too.
    store = memoryStore({ display: [display({ person_id: ME, display_case: ["no-such-badge"] })] });
    expect(await postcardStickers({ personId: ME })).toBeNull();
  });
});
