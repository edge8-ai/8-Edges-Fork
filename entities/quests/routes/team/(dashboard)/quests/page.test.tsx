import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FaceViewer, WornFace } from "@/kernel/shell/faces";
import type { LearnShareStanding } from "@/kernel/shell/page-slots";
import type { Lore } from "../../../../lib/lore";
import type { Campfires } from "../../../../lib/campfires-model";
import type { Lighthouses } from "../../../../lib/lighthouse-model";
import type { Portrait, QuestCard, QuestsPage } from "../../../../lib/quests-read";
import { MATE_LANDS, MATE_PLACE, READER_LANDS, READER_PLACE } from "../../../../ui/lands-fixtures";

// The Quests page's worn borders (LD.4; spec "Faces and borders"). The page
// collects every person it draws a face for and asks the kernel's faces seam
// once per render, for the reader; each face then wears its person's tier and
// nothing else about them: no division, no star, no point.
vi.mock("@/kernel/data/supabase", async () => (await import("@/kernel/data/testing/fake-company-os")).fakeSupabase());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
vi.mock("@/kernel/identity/access-request", () => ({ requirePermission: async () => ({ roles: [] }) }));
// The signed-in reader; a test may sign in as the teammate to read their page.
let actorId = "me";
vi.mock("@/kernel/identity/team-auth", () => ({ requireTeamMember: async () => ({ personId: actorId }) }));

const asks: { ids: readonly string[]; viewer: FaceViewer }[] = [];
let wearing = new Map<string, WornFace>();
vi.mock("@/kernel/shell/faces", async (importActual) => ({
  ...(await importActual<typeof import("@/kernel/shell/faces")>()),
  wornTiersFor: async (ids: readonly string[], viewer: FaceViewer) => {
    asks.push({ ids, viewer });
    return new Map([...wearing].filter(([id]) => ids.includes(id)));
  },
}));

const who = (personId: string, name: string): Portrait => ({ personId, name, initials: name.slice(0, 2).toUpperCase() });
const ME = who("me", "Me Reader");
const GIVER = who("giver", "Gia Giver");
const LIT = who("lit", "Lin Lit");
const MATE = who("mate", "Mai Mate");
const CALLED = who("called", "Cal Called");
const card = (over: Partial<QuestCard>): QuestCard => ({
  id: "q1", kind: "bounty", title: "Share one prompt", ask: null, giver: GIVER, state: "open", learning: false, required: false,
  partySize: 3, monster: "dragon", heads: [{ id: "h1", position: 1, ask: "Share one prompt", closesAt: "2026-10-24T10:00:00.000Z", closed: false, hits: 1, hp: 61, verdict: null, lit: [LIT], mine: null }],
  hp: 61, isGiver: false, isMine: false, giverParty: null, ...over,
});
let page: QuestsPage;
const party = [ME, MATE, CALLED];
// The Lore (QS.4): a learning by someone the page draws nowhere else.
const SAGE = who("sage", "Sam Sage");
const lore: Lore = { entries: [{ id: "l1", author: SAGE, mine: false, title: "Ask for the diff, not the file", postedAt: "2026-10-22T03:00:00.000Z", willTry: 2, youWillTry: false }], firstSpark: false };
// Campfires (QS.5): a burning fire's Host and the people by it, drawn nowhere
// else; a wanted topic draws no face, so nobody who raised a hand is asked about.
const HOST = who("host", "Hoa Host");
const SEAT = who("seat", "Sy Seat");
const campfires: Campfires = {
  wanted: [{ key: "prompt evals", topic: "prompt evals", hands: 3, mine: false }],
  burning: [{ questId: "r1", title: "prompt evals", host: HOST, youHost: false, startsAt: "2026-10-29T09:00:00.000Z", seats: 1, faces: [SEAT], seated: false }],
};
// Lighthouses (QS.6): a lit Beacon's author, drawn nowhere else on the page.
const KEEPER = who("keeper", "Kai Keeper");
const lighthouses: Lighthouses = {
  lit: [{ questId: "b1", title: "Talk at the meetup", url: "https://example.com/talk", author: KEEPER, mine: false }],
  heldFires: [],
  beacons: { lit: 0, canLight: true },
};
const ok = async () => ({ ok: true as const });
vi.mock("@/entities/quests", () => ({
  readQuestsPage: async () => page,
  readParty: async () => party,
  readLore: async () => lore,
  readCampfires: async () => campfires,
  readLighthouses: async () => lighthouses,
  lightBeacon: ok,
  acceptQuest: ok, closeQuest: ok, handBack: ok, reactToTurnIn: ok, summonBounty: ok, turnIn: ok, withdrawQuest: ok, shareLearning: ok, willTry: ok,
  raiseHand: ok, lowerHand: ok, lightFire: ok, takeSeat: ok, leaveSeat: ok,
}));

const { default: QuestsPage } = await import("./page");
const gameStyle = { isOn: async () => true, setGameStyle: ok };

beforeEach(() => {
  asks.length = 0;
  actorId = "me";
  wearing = new Map([
    ["giver", { learnShare: "gold", builder: "legend" }],
    ["lit", { learnShare: "silver", builder: null }],
    ["mate", { learnShare: null, builder: "archon" }],
    ["sage", { learnShare: "platinum", builder: null }],
    ["host", { learnShare: "bronze", builder: null }],
    ["keeper", { learnShare: "silver", builder: null }],
  ]);
  page = {
    season: { name: "Autumn", hits: 1, campfires: 0, beacons: 0, discoveries: 0 },
    boss: card({}),
    board: [card({ id: "q2", title: "Teach a trick", giver: MATE, heads: [{ ...card({}).heads[0], id: "h2", lit: [GIVER] }], giverParty: { called: 1, members: [{ ...CALLED, lit: false, headsIn: 0, heads: 1 }] } })],
    me: ME,
  };
});

const render = async () => renderToStaticMarkup(await QuestsPage({ gameStyle, learnShareStanding: null, questBadgeDrops: null }));

describe("the Quests page's badge drop (QS.15b)", () => {
  it("asks the slot once, for the reader alone, and draws what it answers", async () => {
    const asked: string[] = [];
    const questBadgeDrops = async (reader: { personId: string }) => (asked.push(reader.personId), { spot: "other" as const, node: <span className="test-drop">dropped</span> });
    const html = renderToStaticMarkup(await QuestsPage({ gameStyle, learnShareStanding: null, questBadgeDrops }));
    expect(asked).toEqual(["me"]);
    expect(html.match(/test-drop/g)).toHaveLength(1);
  });
});

describe("the Quests page's worn borders", () => {
  it("asks the faces seam once per render, for the reader, with every person it draws", async () => {
    await render();
    expect(asks).toHaveLength(1);
    expect(asks[0].viewer).toEqual({ personId: "me" });
    expect([...asks[0].ids].sort()).toEqual(["called", "giver", "host", "keeper", "lit", "mate", "me", "sage", "seat"]);
    await render();
    expect(asks).toHaveLength(2);
  });

  it("asks once even in a deployment that keeps no game style", async () => {
    renderToStaticMarkup(await QuestsPage({ gameStyle: null, learnShareStanding: null, questBadgeDrops: null }));
    expect(asks).toHaveLength(1);
  });

  it("puts each wearer's tier on their face, and leaves everyone else plain", async () => {
    const html = await render();
    expect(html.match(/frame-gold/g)?.length).toBeGreaterThanOrEqual(2); // the Giver in the arena and on the board
    expect(html).toContain("frame-silver");
    // The Lore's author wears theirs beside their learning, from the same one ask.
    expect(html).toMatch(/frame-platinum[\s\S]*Ask for the diff, not the file/);
    // A burning fire's Host wears theirs beside "Host", from the same one ask (QS.5).
    expect(html).toMatch(/frame-bronze[\s\S]{0,800}Host <b>Hoa Host<\/b>/);
    // A lighthouse's author wears theirs at its foot, from the same one ask (QS.6).
    expect(html).toMatch(/frame-silver[\s\S]{0,600}Talk at the meetup/);
    // Mai wears only a Builder medal, which never sits beside a face; nobody else wears a border.
    expect(html).not.toMatch(/frame-(?!gold|silver|platinum|bronze)[a-z]+/);
  });

  it("says the tier alone: no division, no star, no point, and no Builder tier", async () => {
    const html = await render();
    // The frame is a class, frame-<tier>; the page prints no tier word, and
    // nothing of where in the tier the wearer stands.
    expect(html).not.toMatch(/division|★|\bpoints?\b|\bGold\b|\bSilver\b|[Ll]egend|[Aa]rchon|\bPlatinum\b|\bIV\b|\bIII\b/);
  });

  it("draws plain faces when the seam answers nothing, as it does for a viewer whose game style is off", async () => {
    wearing = new Map();
    const html = await render();
    expect(html).not.toContain("admin-face-frame");
    expect(html).not.toContain("admin-face--framed");
  });
});

// Your next move (QS.13; spec "Your next move", "What the page never shows").
// The page asks the learnShareStanding slot for its reader alone, and the
// strip carries that reader's tier, points and bar and nobody else's. The slot
// here holds two people's standings in memory, as the ladders do, and answers
// whoever it is asked about, so a page that asked about anyone else would show.
describe("the Quests page's next move", () => {
  const ROMAN = ["", "I", "II", "III", "IV"] as const;
  const at = (tierName: string, division: 1 | 2 | 3 | 4 | null) => ({ tierName, division, words: { game: division ? `${tierName} ${ROMAN[division]}` : tierName, plain: division ? `${tierName}, division ${ROMAN[division]}` : tierName } });
  const standingAt = (points: number, place: { tierName: string; division: 1 | 2 | 3 | 4 | null }, next: number | null, lands = READER_LANDS): LearnShareStanding => ({
    ...at(place.tierName, place.division), points, divisionStart: points - (points % 75), next: next === null ? null : { ...at(place.tierName, 2), start: next },
    pointsFor: { hit: 10, learning: 10, fire: 100, beacon: 250 },
    // Where each act takes the reader, as their own Lands say.
    reaches: { hit: { ...lands.hit.after, newTier: lands.hit.newTier }, learning: { ...lands.learning.after, newTier: lands.learning.newTier }, fire: { ...lands.fire.after, newTier: lands.fire.newTier }, beacon: { ...lands.beacon.after, newTier: lands.beacon.newTier } },
    helm: null,
    lands,
  });
  let standings: Map<string, LearnShareStanding>;
  const askedFor: string[] = [];
  const slot = async (reader: { personId: string }) => {
    askedFor.push(reader.personId);
    return standings.get(reader.personId) ?? null;
  };
  const renderWith = async (learnShareStanding: typeof slot | null) => renderToStaticMarkup(await QuestsPage({ gameStyle, learnShareStanding, questBadgeDrops: null }));

  beforeEach(() => {
    askedFor.length = 0;
    standings = new Map([
      ["me", standingAt(400, READER_PLACE, 450)],
      ["mate", standingAt(7_777, MATE_PLACE, 10_000, MATE_LANDS)],
    ]);
  });

  it("shows the reader's own tier, points and bar, marked only you see this, and nobody else's", async () => {
    const html = await renderWith(slot);
    expect(askedFor).toEqual(["me"]);
    expect(html).toContain("Your next move");
    expect(html).toMatch(/<b>Gold III<\/b> · <span class="qn-num">400<\/span> of 450/);
    expect(html).toContain("only you see this");
    expect(html).not.toMatch(/7,777|7777|Challenger|10,000/);
  });

  it("reads 10 more on the next render once the reader's learning has landed", async () => {
    expect(await renderWith(slot)).toContain('<span class="qn-num">400</span>');
    standings.set("me", standingAt(410, READER_PLACE, 450));
    expect(await renderWith(slot)).toContain('<span class="qn-num">410</span>');
  });

  it("gives the composer's button its points from the slot", async () => {
    expect(await renderWith(slot)).toContain("Share · +10");
  });

  it("without ladders, draws no block, no points and no tier, and the acts still show", async () => {
    const html = await renderWith(null);
    expect(html).toContain("Your next move");
    expect(html).toContain("Share another learning");
    expect(html).toContain("Light the wanted fire on prompt evals");
    expect(html).not.toContain("qn-me");
    expect(html).not.toContain("qn-pts");
    expect(html).not.toContain("→");
    expect(html).not.toContain("only you see this");
    expect(html).not.toContain("Share · +");
  });

  // Lands for you (QS.15; spec "What the page never shows"): the rails carry
  // the reader's own points, places, badges, counts and Titles, and another
  // reader's page carries none of them, whoever is asked about first.
  it("gives each reader their own Lands for you rails and nothing of anyone else's", async () => {
    const mine = await renderWith(slot);
    expect(askedFor).toEqual(["me"]);
    expect(mine.match(/class="qn-loot /g)).toHaveLength(3);
    expect(mine).toContain("Fire keeper II");
    expect(mine).toContain("1 of 5");
    expect(mine).toMatch(/Title to wear: <b>Fire keeper<\/b><small> · you have it<\/small>/);
    expect(mine).not.toMatch(/Challenger|Sovereign|Fire keeper IV|44 of 50|Hunter IV|88 of 100|Lorewright IV|Keeper of the light III|21 of 25|2,?213|2,?123|1,?973/);

    actorId = "mate";
    const theirs = await renderWith(slot);
    expect(askedFor).toEqual(["me", "mate"]);
    expect(theirs.match(/class="qn-loot /g)).toHaveLength(3);
    expect(theirs).toContain("Fire keeper IV");
    expect(theirs).toContain("44 of 50");
    expect(theirs).not.toMatch(/Gold III|Gold II|Gold I\b|Platinum|Fire keeper II\b|1 of 5|Hunter II\b|4 of 10|Lorewright I\b|Keeper of the light I\b|0 of 3|25 to|40 to/);
  });
});
