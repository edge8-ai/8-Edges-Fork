import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionRow, UnlockRow } from "./rows";
import { display, memoryStore, type MemoryStore } from "./testing";

// The door's audiences, as LD.9's negative suite (spec "Testing Decisions",
// "Who never reads it"; ADR 0021 "Who reads what"). Four readers ask about
// one person, Mai:
//
// - Mai herself reads everything of her own through myStanding;
// - a teammate reads what Mai chose to wear and to show, through wornTiers;
// - her manager and an admin read exactly what the teammate reads: the reads
//   take no role, so whatever the reader holds there is no extra read and no
//   extra field.
//
// And the door has no read that takes a subject's id and answers a standing:
// adding one (a `standingOf(personId)`) fails the pinned list below.

const MAI = "person-mai";
const TEAMMATE = "person-teammate";
const MANAGER = "person-manager";
const ADMIN = "person-admin";

let store: MemoryStore = memoryStore();
let access: { personId: string; may: (p: string, t?: { person?: string }) => boolean } | null = null;
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: async () => access }));
vi.mock("./store", () => ({
  get liveStore() {
    return store;
  },
}));
vi.mock("@/entities/quests", () => ({ QuestLog: () => <p>the quest log</p> }));
vi.mock("../ui/badges/OwnAchievements", () => ({ OwnAchievements: () => <p>the badge case</p> }));

const { myStanding } = await import("./standing");
const { wornTiers, wornTiersSeenBy } = await import("./worn");
const { TeammateProfile } = await import("../ui/profile/ProfilePages");

// Numbers no answer to anyone but Mai may carry: her points, her division and
// stars, her act counts and the counts behind the stats she hid.
const ls = (person_id: string): PositionRow => ({
  person_id, ladder: "learn_share", points: 4_321.5, tier: "grandmaster", division: 3, stars: null, immortal_band: null, counts: { hits: 731, sparks: 59, fires: 17, beacons: 13 }, computed_at: "2026-10-21T19:00:00Z",
});
const b = (person_id: string): PositionRow => ({
  person_id, ladder: "builder", points: 14_579.5, tier: "ancient", division: null, stars: 4, immortal_band: null, counts: { cards: 211, humanTokens: 1_357.95 }, computed_at: "2026-10-21T19:00:00Z",
});
const unlock = (person_id: string, ladder: "learn_share" | "builder", key: string, kind: "tier" | "badge" = "tier"): UnlockRow => ({
  id: `${person_id}-${key}`, person_id, kind, ladder, key, unlocked_at: "2026-10-21T19:00:00Z", source: "replay", shown_at: kind === "badge" ? null : "2026-10-21T19:00:00Z",
});

/** Mai wears both ladders and shows one stat (sparks), a title and two badges; everything else is hidden. */
function seedMai(choices: Partial<Parameters<typeof display>[0]> = {}) {
  store = memoryStore({
    positions: [ls(MAI), b(MAI)],
    unlocks: [unlock(MAI, "learn_share", "grandmaster"), unlock(MAI, "builder", "ancient"), unlock(MAI, "learn_share", "spark-struck", "badge"), unlock(MAI, "builder", "anvil-i", "badge"), unlock(MAI, "learn_share", "lorewright-i", "badge")],
    display: [display({ person_id: MAI, wear_learn_share: true, wear_builder: true, shown_stats: ["sparks"], title_badge: "spark-struck", display_case: ["spark-struck", "anvil-i"], ...choices })],
  });
}

// What only Mai may read, by key and by value.
const PRIVATE_KEYS = ["division", "stars", "points", "shown", "counts", "next", "badgesFound", "waiting", "tables", "immortalBand", "toGo"];
const PRIVATE_VALUES = ["4321", "14579", "731", "17", "13", "211", "1357", "lorewright"];

function assertNothingPrivate(answer: unknown) {
  const json = JSON.stringify(answer instanceof Map ? [...answer] : answer);
  for (const key of PRIVATE_KEYS) expect([key, json.includes(`"${key}"`)]).toEqual([key, false]);
  for (const value of PRIVATE_VALUES) expect([value, json.includes(value)]).toEqual([value, false]);
}

beforeEach(() => seedMai());

describe("the door's reads", () => {
  // Every value the door exports, and why it may: a read answers the reader
  // about the reader, or only what the subject chose to show; a command acts on
  // the reader's own row. A new export is a new reader: decide its audience,
  // test it here, then add it.
  const DOOR: Record<string, string> = {
    myStanding: "read: the reader about the reader, everything",
    wornTiers: "read: what each person chose to wear and show, never a division, star or point",
    landsFor: "pure: works on the reader's own myStanding answer, reads nothing",
    wornFaces: "the faces seam's provider: wornTiers narrowed to Learn & Share, empty when the viewer's game style is off",
    setWear: "command: the reader's own wear switch",
    setDisplay: "command: the reader's own profile choices",
    markShown: "command: the reader's own rank-up and drops seen",
    gameStyle: "slot: the reader's own game style",
    learnShareStanding: "slot: the reader's own Learn & Share standing",
    dressedProfile: "slot: the reader's own profile (Own), or a teammate's from wornTiers (Teammate)",
    RankUpGate: "slot: the signed-in reader's own waiting rank-up",
    badgeDrops: "slot: the reader's own badge drops",
    questBadgeDrops: "slot: the reader's own badge drop on Quests",
    postcardStickers: "slot: the first three badges of the display case a person chose, from wornTiers",
    subscriptions: "the bus subscribers: recompute the person an act names, answer nobody",
  };

  it("exports only the reads, commands and slots above", async () => {
    // The loaded module, not its text, so an export of any form counts:
    // `export *`, a bare `export { standingOf }`, a const, a re-export.
    const door = await import("../index");
    expect(Object.keys(door).sort()).toEqual(Object.keys(DOOR).sort());
  });

  it("asks myStanding about the reader alone: one argument, their identity, no subject", () => {
    expect(myStanding.length).toBe(1);
    // wornTiers takes ids and options, the seam's form ids and a viewer; neither has a role.
    expect(wornTiers.length).toBe(1);
    expect(wornTiersSeenBy.length).toBe(2);
  });
});

describe("wornTiers never returns a division, a star, a point or anything hidden", () => {
  it("answers the tier words alone for a person who wears both", async () => {
    const worn = await wornTiers([MAI]);
    expect(worn.get(MAI)).toEqual({ learnShare: "grandmaster", builder: "ancient" });
    assertNothingPrivate(worn);
  });

  it("answers no tier for a person who wears nothing", async () => {
    seedMai({ wear_learn_share: false, wear_builder: false });
    expect((await wornTiers([MAI])).get(MAI)).toEqual({ learnShare: null, builder: null });
    expect((await wornTiersSeenBy([MAI], { personId: TEAMMATE })).get(MAI)).toEqual({ learnShare: null, builder: null });
  });

  it("answers a full profile with only the items switched on", async () => {
    const profile = await wornTiers([MAI], { profile: true });
    expect(profile).toEqual({ learnShare: "grandmaster", builder: "ancient", banner: "meadow", titleBadge: "spark-struck", stats: { sparks: 59 }, displayCase: ["spark-struck", "anvil-i"] });
    assertNothingPrivate(profile);
  });

  it("answers a profile with everything switched off with nothing of hers", async () => {
    seedMai({ wear_learn_share: false, wear_builder: false, shown_stats: [], title_badge: null, display_case: [] });
    const profile = await wornTiers([MAI], { profile: true });
    expect(profile).toEqual({ learnShare: null, builder: null, banner: "meadow", titleBadge: null, stats: {}, displayCase: [] });
    assertNothingPrivate(profile);
    expect(JSON.stringify(profile)).not.toMatch(/\d/);
  });
});

describe("four readers ask about Mai", () => {
  // Readers as the session describes them: the door is never handed a role,
  // so extra powers cannot widen what it answers.
  const viewers = {
    teammate: { personId: TEAMMATE, may: (p: string) => p === "ladders.mine" || p === "surface.team" },
    manager: { personId: MANAGER, roles: ["team-member", "manager"], reports: [MAI], may: () => true },
    admin: { personId: ADMIN, roles: ["admin", "super-admin"], may: () => true },
  };

  it("gives Mai everything of her own", async () => {
    const s = await myStanding({ personId: MAI });
    expect(s.learnShare).toMatchObject({ points: 4_321.5, tier: "grandmaster", counts: { hits: 731 } });
    expect(s.builder).toMatchObject({ points: 14_579.5, tier: "ancient" });
    expect(s.badgesFound.map((f) => f.key).sort()).toEqual(["anvil-i", "lorewright-i", "spark-struck"]);
  });

  it("gives the manager and the admin, asking myStanding, their own standing and nothing of Mai's", async () => {
    for (const viewer of [viewers.manager, viewers.admin]) {
      const s = await myStanding(viewer);
      expect(s.learnShare.points).toBe(0);
      expect(s.badgesFound).toEqual([]);
      expect(JSON.stringify(s)).not.toContain(MAI);
      assertNothingPrivate(s.learnShare.counts);
    }
  });

  it("gives the teammate, the manager and the admin the same worn tiers, and nothing else", async () => {
    const answers = await Promise.all(Object.values(viewers).map((v) => wornTiersSeenBy([MAI], v)));
    for (const answer of answers) {
      expect([...answer]).toEqual([[MAI, { learnShare: "grandmaster", builder: "ancient" }]]);
      assertNothingPrivate(answer);
    }
  });

  it("draws the teammate, the manager and the admin the same page of Mai's", async () => {
    const pages: string[] = [];
    for (const viewer of Object.values(viewers)) {
      access = viewer;
      pages.push(renderToStaticMarkup(await TeammateProfile({ personId: MAI, person: { name: "Mai Tran", initials: "MT", handle: null, photoUrl: null }, postcard: <div>the postcard</div> })));
    }
    expect(pages[1]).toBe(pages[0]);
    expect(pages[2]).toBe(pages[0]);
    for (const never of ["Achievements", "the badge case", "the quest log", "Lorewright", "4,321", "731", "★", "Customise", "Only you"]) expect([never, pages[0].includes(never)]).toEqual([never, false]);
  });
});
