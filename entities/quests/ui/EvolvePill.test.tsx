import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LearnShareStanding } from "@/entities/ladders";
import type { Evolve } from "../lib/evolve-model";
import type { Lore, LoreEntry } from "../lib/lore";
import type { QuestsPage } from "../lib/quests-read";
import type { BeaconActions, EvolveActions, LoreActions, QuestActions } from "./actions-type";
import { place, READER_LANDS } from "./lands-fixtures";

// The Evolve pill on the page (QS.7; version 10, section 4), drawn as the
// server draws it through QuestsView, with the game style on and off: three
// will try offers a fire, a lit fire says where its points land, a held fire
// offers its Beacon and the Host's notes, and a Beacon lit is the last word.
// Only the author's own learning ever carries it, even when a state for
// someone else's learning reaches the page.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { QuestsView } = await import("./QuestsView");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const loreActions = { shareLearning: ok, willTry: ok } as unknown as LoreActions;
const beaconActions: BeaconActions = { lightBeacon: ok };
const evolveActions: EvolveActions = { hostFireOnLearning: ok };
const NOW = "2026-10-24T03:00:00.000Z";
const kim = { personId: "kim", name: "Kim Dao", initials: "KD" };
const chi = { personId: "chi", name: "Chi Nguyen", initials: "CN" };
const page: QuestsPage = { season: { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 }, boss: null, board: [], me: kim };
const STANDING: LearnShareStanding = {
  ...place("Gold", 3), points: 400, divisionStart: 375, next: { ...place("Gold", 2), start: 450 },
  pointsFor: { hit: 10, learning: 10, fire: 100, beacon: 250 },
  reaches: { hit: { ...place("Gold", 3), newTier: false }, learning: { ...place("Gold", 3), newTier: false }, fire: { ...place("Gold", 2), newTier: false }, beacon: { ...place("Platinum", 4), newTier: true } },
  helm: null,
  lands: READER_LANDS,
};

const learning = (id: string, author = kim, willTry = 3): LoreEntry => ({ id, author, mine: author === kim, title: `Learning ${id}`, postedAt: "2026-10-20T00:00:00.000Z", willTry, youWillTry: false });
const lore = (entries: LoreEntry[], evolve: Record<string, Evolve>): Lore => ({ entries, firstSpark: false, evolve });
const one = (state: Evolve): Lore => lore([learning("l1")], { l1: state });
const render = (value: Lore, opts: { gameOn?: boolean; standing?: LearnShareStanding | null; evolve?: EvolveActions | null } = {}) =>
  renderToStaticMarkup(
    <QuestsView page={page} party={[]} now={NOW} actions={actions} gameOn={opts.gameOn ?? true} lore={value} loreActions={loreActions} beaconActions={beaconActions} evolveActions={opts.evolve === undefined ? evolveActions : opts.evolve} learnShare={opts.standing === undefined ? STANDING : opts.standing} />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const pill = (html: string) => html.match(/<div class="qn-evolve[^"]*" data-evolve="[a-z]+">[\s\S]*?<\/div>(?=<\/div><\/li>)/)?.[0] ?? "";

const FIRE: Evolve = { step: "fire", willTry: 3 };
const LIT: Evolve = { step: "lit", questId: "r1" };
const HELD: Evolve = { step: "held", questId: "r1", title: "Our proposal template", heldAt: "2026-10-14T09:20:00.000Z", sat: 6 };
const BEACON: Evolve = { step: "beacon", questId: "b1" };

describe("the Evolve pill, in the game style", () => {
  it("offers the author a fire at three will try, with its points from the ladders", () => {
    const html = render(one(FIRE));
    expect(html).toContain('data-evolve="fire"');
    expect(text(pill(html))).toBe(" Evolve 3 will try Host a 20-minute fire on this · 100 ");
    expect(html).toContain('data-move="evolve-fire"');
  });

  it("says a lit fire is the author's to host, where its points land, and the way to it", () => {
    const t = text(pill(render(one(LIT))));
    expect(t).toContain("Fire");
    expect(t).toContain("Lit. You host · +100 once someone who came is marked");
    expect(t).toContain("See it at Campfires");
  });

  it("offers a held fire's Beacon with when it was held and how many sat by it, and the Host's notes", () => {
    const t = text(pill(render(one(HELD))));
    expect(t).toContain("Evolve Fire held Wed 14 Oct · 6 sat by it");
    expect(t).toContain("Light it as a Beacon · 250");
    expect(t).toContain("Publish the recording or a post.");
    expect(t).toContain("Write what you taught");
  });

  it("ends at the Beacon lit, with no move left", () => {
    const html = pill(render(one(BEACON)));
    expect(text(html)).toBe(" Beacon Lit. It stands on the horizon. ");
    expect(html).not.toContain("<button");
  });

  it("shows no points on any button without the ladders' slot", () => {
    const fire = text(pill(render(one(FIRE), { standing: null })));
    expect(fire).toContain("Host a 20-minute fire on this ");
    expect(fire).not.toMatch(/\d{3}/);
    expect(text(pill(render(one(LIT), { standing: null })))).toContain("Lit. You host · It lands once someone who came is marked");
    expect(text(pill(render(one(HELD), { standing: null })))).not.toContain("250");
  });

  it("draws the offer but no way to take it when the page has no Evolve move", () => {
    expect(pill(render(one(FIRE), { evolve: null }))).toMatch(/<button[^>]*disabled=""[^>]*data-move="evolve-fire"|data-move="evolve-fire"[^>]*disabled=""/);
  });
});

describe("the Evolve pill, plain", () => {
  it("says the same steps with no fire or horizon", () => {
    const states = [FIRE, LIT, HELD, BEACON].map((s) => text(pill(render(one(s), { gameOn: false }))));
    expect(states[0]).toBe(" Take it further 3 will try Host a 20-minute session on this · 100 ");
    expect(states[1]).toContain("Has a time. You host · +100 points once someone who came is marked");
    expect(states[2]).toContain("Session held Wed 14 Oct · 6 came");
    expect(states[2]).toContain("Take it outside · 250");
    expect(states[3]).toBe(" Taken outside Added. It shows under Taken outside. ");
    for (const t of states) expect(t).not.toMatch(/\b(fire|horizon|Beacon)\b/i);
  });
});

describe("who sees the pill", () => {
  it("draws it on the author's own learning only, even when a state for someone else's reaches the page", () => {
    const html = render(lore([learning("mine"), learning("chis", chi, 5)], { mine: FIRE, chis: FIRE }));
    expect(html.match(/data-evolve="/g)).toHaveLength(1);
    const chis = html.slice(html.indexOf("Learning chis"));
    expect(chis).not.toContain("qn-evolve");
    expect(text(chis)).toContain("5 will try");
    expect(text(chis)).toContain("Will try");
  });

  it("draws nothing for a learning with no state: under three will try, or on a page with no database", () => {
    expect(render(lore([learning("l1", kim, 2)], {}))).not.toContain("qn-evolve");
    expect(render({ entries: [learning("l1")], firstSpark: false })).not.toContain("qn-evolve");
  });
});
