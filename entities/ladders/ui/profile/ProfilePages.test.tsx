import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isForkTree } from "@/scripts/fork-tree.mjs";
import type { Tier } from "../../lib/points";
import type { PositionRow, UnlockRow } from "../../lib/rows";
import { display, memoryStore, type MemoryStore } from "../../lib/testing";

// The dressed profile's two pages (LD.6, redrawn LD.10), serialised as the
// server draws them.
//
// A teammate's page (/team/directory/[id]) shows exactly what its owner chose
// and nothing else: for a person who hides everything, no tier, division, star,
// point, stat, quest log, locked badge or switch; for a person who shows both
// emblems and two stats, those and only those, and still no division, star or
// point. A viewer whose own game style is off gets the postcard alone.
//
// The owner's page (/team/profile) is theirs alone: it reads the signed-in
// reader, never an id. With the game style on it is the game screen with five
// tabs, My details last; with it off, or without ladders.mine, it is the
// postcard view, Your profile over Postcard and My details. The private
// details are never under the Postcard tab.

const OWNER = "person-owner";
const VIEWER = "person-viewer";

let store: MemoryStore = memoryStore();
let access: { personId: string; may: (p: string, t?: { person?: string }) => boolean } | null = null;
let viewerGame = true;
vi.mock("@/kernel/identity/access-request", () => ({ getAccess: async () => access }));
vi.mock("../../lib/store", () => ({
  get liveStore() {
    return store;
  },
}));
vi.mock("../../lib/game-style", () => ({ gameStyleOf: async () => viewerGame }));
vi.mock("@/entities/quests", () => ({ QuestLog: () => <p>the quest log</p> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
// The Achievements tab reads the owner's act facts through four doors; its own tests (ui/badges) cover it.
vi.mock("../badges/OwnAchievements", () => ({ OwnAchievements: () => <p>the badge case</p> }));

const { OwnProfile, OwnProfileView, TeammateProfile, TeammateProfileView } = await import("./ProfilePages");
const { shapeStanding } = await import("../../lib/standing");

const ls = (person_id: string, points: number, tier: Tier, division: 1 | 2 | 3 | 4): PositionRow => ({
  person_id, ladder: "learn_share", points, tier, division, stars: null, immortal_band: null, counts: { hits: 37, sparks: 12, fires: 3, beacons: 1 }, computed_at: "2026-10-21T19:00:00Z",
});
const b = (person_id: string, points: number, tier: Tier, stars: 1 | 2 | 3 | 4 | 5): PositionRow => ({
  person_id, ladder: "builder", points, tier, division: null, stars, immortal_band: null, counts: { cards: 148, humanTokens: 212.5 }, computed_at: "2026-10-21T19:00:00Z",
});
const unlock = (person_id: string, ladder: "learn_share" | "builder", key: string): UnlockRow => ({
  id: `${person_id}-${key}`, person_id, kind: "tier", ladder, key, unlocked_at: "2026-10-21T19:00:00Z", source: "replay", shown_at: "2026-10-21T19:00:00Z",
});
const may = (who: string) => (p: string, t?: { person?: string }) => p === "ladders.mine" && (!t?.person || t.person === who);

const person = { name: "Mai Tran", initials: "MT", handle: "maitran", photoUrl: null };
const postcard = <div className="pe-page">the postcard</div>;
const details = <div className="pe-page">the private details</div>;

function seed(choices: Parameters<typeof display>[0]) {
  store = memoryStore({
    positions: [ls(OWNER, 450, "gold", 2), b(OWNER, 9_200.5, "legend", 3)],
    unlocks: [unlock(OWNER, "learn_share", "gold"), unlock(OWNER, "builder", "legend")],
    display: [display(choices)],
  });
}

const teammatePage = async () => renderToStaticMarkup(await TeammateProfile({ personId: OWNER, person, postcard }));

// What a teammate must never read, whatever the owner chose.
const NEVER = ["★", "Gold II", "Legend ★", "division", "points", ">450<", "9,200", "Quest log", "Achievements", "locked", "Locked", 'role="switch"', "Customise", "the quest log", "ladder-emblem-stars", "Only you", "Found by", "???", "Your badge case", "the badge case", "bd-tile", "Teammates see", "Hidden from", "My details", "the private details"];

beforeEach(() => {
  access = { personId: VIEWER, may: may(VIEWER) };
  viewerGame = true;
});

const editor = { may: { "ladders.mine": true }, actions: { setDisplay: async () => ({ ok: true as const }), setGameStyle: async () => ({ ok: true as const }) } };

describe("a teammate's view", () => {
  it("shows nothing of a person who hides everything: no ranks, no stats, and the postcard", async () => {
    seed({ person_id: OWNER });
    const html = await teammatePage();
    for (const never of NEVER) expect(html).not.toContain(never);
    for (const tier of ["Gold", "Legend", "helm-", "medal-", "border-"]) expect(html).not.toContain(tier);
    expect(html).not.toContain('class="pf-ranks"');
    expect(html).not.toContain('class="pf-stats"');
    for (const stat of ["hits landed", "sparks", "fires hosted", "beacons lit", "cards shipped", "Human Tokens shipped"]) expect(html).not.toContain(stat);
    expect(html).toContain("Mai Tran");
    // Two tabs only: Overview and Postcard.
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain(">Overview<");
    expect(html).toContain(">Postcard<");
  });

  // The fork ships a plain emblem set in place of the private art (ADR 0021),
  // so the art's file names are not there to find.
  it.skipIf(isForkTree(process.cwd()))("shows exactly the two stats and both emblems a person switched on, and no division, star or point", async () => {
    seed({ person_id: OWNER, wear_learn_share: true, wear_builder: true, shown_stats: ["hits", "cards"] });
    const html = await teammatePage();
    for (const never of NEVER) expect(html).not.toContain(never);
    expect(html).toMatch(/<img src="[^"]*helm-gold[^"]*"/);
    expect(html).toMatch(/<img src="[^"]*medal-legend[^"]*"/);
    expect(html).toContain(">Gold</h3>");
    expect(html).toContain(">Legend</h3>");
    expect(html).toContain("<b>37</b><span>hits landed</span>");
    expect(html).toContain("<b>148</b><span>cards shipped</span>");
    for (const hidden of ["<span>sparks</span>", "fires hosted", "beacons lit", "Human Tokens shipped", "212.5"]) expect(html).not.toContain(hidden);
  });

  it("shows the five badges the owner put in their showcase, each with its story, and no tile they did not choose (LD.7b)", async () => {
    const five = ["hunter-i", "spark-struck", "anvil-i", "first-hit", "first-strike"];
    seed({ person_id: OWNER, display_case: five });
    store.unlocks.push(...five.map((key) => ({ ...unlock(OWNER, "learn_share", key), kind: "badge" as const, witness_table: null, witness_id: null })));
    const html = await teammatePage();
    for (const never of NEVER) expect(html).not.toContain(never);
    // On the hero's showcase and full size on the Overview: five medals, each its name.
    for (const name of ["Hunter I", "Spark struck", "Anvil I", "First hit", "First strike"]) expect(html.split(`>${name}<`).length - 1).toBe(2);
    expect(html.match(/class="bd-full-i /g)).toHaveLength(5);
    expect(html).toContain("Three slimes now flinch at your name.");
    expect(html).not.toContain("Lorewright");
    expect(html).not.toContain("bd-tile--locked");
    expect(html).not.toContain("bd-tile--secret");
  });

  it("is the postcard alone to a viewer whose game style is off", async () => {
    seed({ person_id: OWNER, wear_learn_share: true, wear_builder: true, shown_stats: ["hits", "cards"] });
    viewerGame = false;
    expect(await teammatePage()).toBe('<div class="pe-page">the postcard</div>');
  });
});

describe("the views, drawn from answers already read", () => {
  it("draw a teammate's page from a WornProfile alone, which carries no division, star or point", () => {
    const html = renderToStaticMarkup(
      <TeammateProfileView person={person} worn={{ learnShare: "gold", builder: null, banner: "lighthouse", titleBadge: null, stats: { sparks: 12 }, displayCase: [] }} gameOn postcard={postcard} />,
    );
    for (const never of NEVER) expect(html).not.toContain(never);
    expect(html).toContain("<b>12</b><span>sparks</span>");
    expect(html).not.toContain(">Builder<");
  });

  // The fork ships a plain emblem set in place of the private art (ADR 0021),
  // so the art's file names are not there to find.
  it.skipIf(isForkTree(process.cwd()))("draw the owner's page from their standing: both rank cards in full, the shown one marked so", () => {
    seed({ person_id: OWNER, wear_learn_share: true });
    const standing = shapeStanding({ personId: OWNER }, { positions: store.positions, unlocks: store.unlocks, display: store.display });
    const html = renderToStaticMarkup(<OwnProfileView personId={OWNER} person={person} standing={standing} editor={editor} postcard={postcard} details={details} />);
    expect(html).toContain("Customise");
    expect(html).toContain('role="img" aria-label="Gold II"');
    expect(html).toContain('aria-label="Legend ★★★">Legend</h3>');
    expect(html).toContain("Teammates see this");
    expect(html).toContain("Hidden from teammates");
  });

  it("draw the owner's postcard view with the game style off: Your profile, two tabs, no ladders", () => {
    seed({ person_id: OWNER, game_style: false });
    const standing = shapeStanding({ personId: OWNER }, { positions: store.positions, unlocks: store.unlocks, display: store.display });
    const html = renderToStaticMarkup(<OwnProfileView personId={OWNER} person={person} standing={standing} editor={editor} postcard={postcard} details={details} />);
    expect(html).toContain(">Your profile</h1>");
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain(">Postcard<");
    expect(html).toContain(">My details<");
    expect(html).toContain("the postcard");
    expect(html).toContain('aria-checked="false"');
    for (const game of ["Customise", "Ranked ladders", "Quest log", "the quest log", "the badge case", "pf-hero", "points"]) expect(html).not.toContain(game);
  });
});

describe("the owner's own page", () => {
  it("dresses the signed-in reader, with Customise, the game style switch and five tabs, My details last", async () => {
    store = memoryStore();
    access = { personId: OWNER, may: may(OWNER) };
    const html = renderToStaticMarkup(await OwnProfile({ person, postcard, details }));
    expect(html).toContain("Customise");
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain("Game style");
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(tabs).toEqual(["Overview", "Quest log", "Achievements", "Postcard", "My details"]);
    // A new person: both ladders hidden from teammates, no stats, an empty showcase.
    expect(html.match(/Hidden from teammates/g)).toHaveLength(2);
    expect(html).not.toContain('class="pf-stats"');
    expect(html).toContain("Pick up to five badges in Customise.");
    // Their own counts on the Overview, marked Only you.
    expect(html).toContain("Only you");
  });

  it("keeps the private details off the Postcard tab", async () => {
    store = memoryStore();
    access = { personId: OWNER, may: may(OWNER) };
    const onPostcard = renderToStaticMarkup(await OwnProfile({ person, postcard, details, tab: "postcard" }));
    expect(onPostcard).toContain("the postcard");
    expect(onPostcard).not.toContain("the private details");
    expect(onPostcard).not.toContain("Only you");
    const onDetails = renderToStaticMarkup(await OwnProfile({ person, postcard, details, tab: "details" }));
    expect(onDetails).toContain("the private details");
    expect(onDetails).not.toContain("the postcard<");
  });

  it("is the postcard view with no switch without ladders.mine, or signed out", async () => {
    access = { personId: OWNER, may: () => false };
    const html = renderToStaticMarkup(await OwnProfile({ person, postcard, details }));
    expect(html).toContain(">Your profile</h1>");
    expect(html).toContain("the postcard");
    expect(html).not.toContain("Game style");
    expect(html).not.toContain("the private details");
    access = null;
    expect(renderToStaticMarkup(await OwnProfile({ person, postcard, details }))).toContain("the postcard");
  });

  it("says so, above the postcard view, when the reader's ladders cannot be read", async () => {
    access = { personId: OWNER, may: may(OWNER) };
    const { ReadFailure } = await import("@/kernel/data/read");
    store = { ...memoryStore(), positionsOf: async () => { throw new ReadFailure("[ladders] ladder_positions", "down"); } } as MemoryStore;
    const html = renderToStaticMarkup(await OwnProfile({ person, postcard, details }));
    expect(html).toContain("Your ladders could not be read just now.");
    expect(html).toContain("the postcard");
    expect(html).not.toContain("Customise");
  });
});
