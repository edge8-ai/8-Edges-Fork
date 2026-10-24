import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HeadCard, QuestCard, QuestsPage } from "../lib/quests-read";
import type { LoreActions, QuestActions } from "./actions-type";
import type { Lore } from "../lib/lore";
import type { LearnShareStanding, QuestDropSpot } from "@/kernel/shell/page-slots";
import type { Campfires } from "../lib/campfires-model";
import { noBadges, READER_LANDS } from "./lands-fixtures";

// The Quests page with the game style on and off (QS.11; Khoa, 2026-10-21).
// Rendered to markup as the server draws it: on, the arena and its monster;
// off, the plain view, where a plant grows as the people asked answer, with
// no monster, no HP and no game words. The switch shows only when the
// deployment can keep the choice.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const { QuestsView } = await import("./QuestsView");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const NOW = "2026-10-22T03:00:00.000Z";
const giver = { personId: "g", name: "Member G", initials: "MG" };
const lit = [{ personId: "a", name: "Member A", initials: "MA" }];

const head = (over: Partial<HeadCard> = {}): HeadCard => ({ id: "h1", position: 1, ask: "Share one prompt", closesAt: "2026-10-24T10:00:00.000Z", closed: false, hits: 7, hp: 61, verdict: null, lit, mine: null, ...over });
const boss: QuestCard = {
  id: "q1", kind: "bounty", title: "Share one prompt", ask: null, giver, state: "open", learning: false, required: false,
  partySize: 18, monster: "dragon", heads: [head()], hp: 61, isGiver: false, isMine: false, giverParty: null,
};
const full: QuestsPage = { season: { name: "Autumn", hits: 7, campfires: 0, beacons: 0, discoveries: 0 }, boss, board: [], me: giver };
// The reader's Learn & Share standing as the learnShareStanding slot hands it over (QS.13).
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
  helm: <span className="test-helm">helm</span>,
  lands: READER_LANDS,
};
const empty: QuestsPage ={ season: { name: "Autumn", hits: 0, campfires: 0, beacons: 0, discoveries: 0 }, boss: null, board: [], me: giver };

const render = (page: QuestsPage, gameOn: boolean, withSwitch = true) =>
  renderToStaticMarkup(<QuestsView page={page} party={[]} now={NOW} actions={actions} gameOn={gameOn} setGameStyle={withSwitch ? ok : null} />);

describe("the Quests page and its game style", () => {
  it("draws the arena with the game style on, and the switch says so", () => {
    const html = render(full, true);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("qs-arena");
    expect(html).toContain("HP");
    expect(html).not.toContain("admin-myweek-sprout");
  });

  it("draws the plant view with the game style off: a plant, the share answered, and no monster", () => {
    const html = render(full, false);
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain("admin-myweek-sprout");
    expect(html).toContain("39%");
    expect(html).toContain("of the people asked have answered");
    expect(html).toContain("Post a quest");
    expect(html).not.toContain("qs-arena");
    expect(html).not.toMatch(/\bHP\b|Summon|hits? landed|Tavern|Boss bounty/);
  });

  it("names only the people who answered, in both views", () => {
    for (const on of [true, false]) {
      const html = render(full, on);
      expect(html).toContain("MA");
      expect(html).not.toMatch(/not answered|missed/i);
    }
  });

  it("says a turn-in plainly with the game style off, and as a hit with it on", () => {
    const answered: QuestsPage = { ...full, boss: { ...boss, heads: [head({ mine: { standing: "turned_in", late: false, turnInText: "Done.", reacted: false } })] } };
    expect(render(answered, true)).toContain("Hit landed.");
    const plain = render(answered, false);
    expect(plain).toContain("Answered.");
    expect(plain).not.toMatch(/Hit landed|Got away/);
  });

  it("draws the empty page plainly with a seed in its pot", () => {
    const html = render(empty, false);
    expect(html).toContain("Nothing asked of anyone right now.");
    expect(html).toContain("A seed, waiting");
    expect(html).not.toContain("monster");
  });

  it("shows no switch when the deployment keeps no choice, and stays the game", () => {
    const html = render(full, true, false);
    expect(html).not.toContain('role="switch"');
    expect(html).toContain("qs-arena");
  });
});

// The Lore (QS.4): Spark's learnings in both styles, with Will try on
// someone else's learning and never on the reader's own, and nobody named who
// said Will try.
describe("the Lore on the Quests page", () => {
  const lore: Lore = {
    firstSpark: false,
    entries: [
      { id: "l1", author: giver, mine: true, title: "Ask the client what done means", postedAt: "2026-10-22T02:00:00.000Z", willTry: 2, youWillTry: false },
      { id: "l2", author: lit[0]!, mine: false, title: "Record the demo before the call", postedAt: "2026-10-20T03:00:00.000Z", willTry: 1, youWillTry: true },
    ],
  };
  const loreActions = { shareLearning: ok, willTry: ok } as unknown as LoreActions;
  const withLore = (gameOn: boolean, value: Lore = lore) =>
    renderToStaticMarkup(<QuestsView page={full} party={[]} now={NOW} actions={actions} gameOn={gameOn} setGameStyle={ok} lore={value} loreActions={loreActions} learnShare={STANDING} />);

  it("is the Lore in the game style, with the composer, the counts and Will try on someone else's learning only", () => {
    const html = withLore(true);
    expect(html).toContain("The Lore");
    expect(html).toContain("What did you learn this week?");
    expect(html).toContain("Share · +10");
    expect(html).toContain("<b>You</b> · 1h ago");
    expect(html).toContain("2 will try");
    expect(html).toContain("You&#x27;ll try it");
    expect(html.match(/class="qn-try"/g)).toHaveLength(1);
    expect(html).toContain('href="/team/ideas?kind=learning"');
  });

  it("is Learnings in the plain style, with the points said plainly and no art", () => {
    const html = withLore(false);
    const section = html.slice(html.indexOf('aria-labelledby="qn-lore-h"'));
    expect(section).toContain("Learnings");
    expect(html).not.toContain("The Lore");
    expect(section).toContain("Share · +10 points");
    expect(section).not.toContain("qs-glyph");
    expect(html).not.toContain("Spark struck");
  });

  it("says so when there are no learnings, in both styles", () => {
    for (const on of [true, false]) expect(withLore(on, { entries: [], firstSpark: true })).toContain("No learnings yet. Share the first thing you learned this week.");
  });
});

// Your next move (QS.13): the reader's block and the act cards, in both
// styles, and without ladders. Each card carries the move it scrolls to.
describe("Your next move on the Quests page", () => {
  const owed: QuestsPage = { ...full, boss: { ...boss, heads: [head({ mine: { standing: "called", late: false, turnInText: null, reacted: false } })] } };
  const fires: Campfires = { wanted: [{ key: "evals", topic: "prompt evals", hands: 4, mine: false }], burning: [] };
  const draw = (gameOn: boolean, learnShare: LearnShareStanding | null, beacons = true) =>
    renderToStaticMarkup(<QuestsView page={owed} party={[]} now={NOW} actions={actions} gameOn={gameOn} setGameStyle={ok} campfires={fires} learnShare={learnShare} beacons={beacons} />);
  const strip = (html: string) => {
    const at = html.indexOf('class="qn-next"');
    return html.slice(at, html.indexOf("</section>", at));
  };

  it("draws the reader's helm, tier, points and bar, and four acts with their points and reward", () => {
    const html = strip(draw(true, STANDING));
    expect(html).toContain("Open right now. Each one climbs your Learn &amp; Share ladder.");
    expect(html).toContain("test-helm");
    expect(html).toMatch(/<b>Gold III<\/b> · <span class="qn-num">400<\/span> of 450/);
    expect(html).toMatch(/<progress class="qn-bar" max="100" value="33"/);
    expect(html).toContain("only you see this");
    expect(html.match(/class="qn-act /g)).toHaveLength(4);
    expect(html).toContain("Light the wanted fire on prompt evals");
    expect(html).toMatch(/<b>100<\/b>[\s\S]*→ <b>Gold II<\/b>/);
    expect(html).toMatch(/<b>250<\/b>[\s\S]*→ <b>Platinum IV<\/b><i>new tier<\/i>/);
    expect(html.match(/new tier/g)).toHaveLength(1);
  });

  it("speaks plainly and draws no helm with the game style off", () => {
    const html = strip(draw(false, STANDING));
    expect(html).not.toContain("test-helm");
    expect(html).toContain("Gold, division III");
    expect(html).toContain("Answer the Bounty");
    expect(html).not.toContain("qs-glyph");
  });

  it("with no standing, shows the four acts without points or tier, and no block", () => {
    const html = strip(draw(true, null));
    expect(html.match(/class="qn-act /g)).toHaveLength(4);
    expect(html).not.toMatch(/qn-me|qn-pts|→|only you see this|Gold|Platinum/);
    expect(html).toContain("Open right now.");
    expect(html).not.toContain("Learn &amp; Share ladder");
  });

  it("puts the moves the cards name on the page: the boss's Turn in, the composer and the cold fire's Light it", () => {
    const html = draw(true, STANDING);
    expect(html).toContain('data-move="turn-in"');
    expect(html).toContain('data-move="share-learning"');
    expect(html).toContain('data-move="light-evals"');
  });
});

// A found badge on the Quests page (QS.15b): the ladders hand one drop and
// the spot beside the act that found it, and the page stands it there, once.
describe("a badge drop on the Quests page", () => {
  const draw = (spot: QuestDropSpot | null, gameOn = true) =>
    renderToStaticMarkup(<QuestsView page={full} party={[]} now={NOW} actions={actions} gameOn={gameOn} setGameStyle={ok} learnShare={STANDING} badgeDrop={spot ? { spot, node: <span className="test-badge">found</span> } : null} />);
  /** Whether the drop stands after the first marker and before the second, and only once. */
  const between = (html: string, after: string, before: string) => {
    const at = html.indexOf("test-badge");
    return html.match(/test-badge/g)?.length === 1 && html.indexOf(after) >= 0 && html.indexOf(after) < at && at < html.indexOf(before);
  };

  it("stands each drop beside its act: under Your next move, the arena, the Campfires' heading, the composer and the horizon", () => {
    expect(between(draw("other"), 'class="qn-next"', "qs-arena")).toBe(true);
    expect(between(draw("hit"), "qs-arena", 'id="qn-fires-h"')).toBe(true);
    expect(between(draw("fire"), 'id="qn-fires-h"', 'id="qn-lore-h"')).toBe(true);
    expect(between(draw("learning"), 'class="qn-share"', 'id="qn-lh-h"')).toBe(true);
    expect(between(draw("beacon"), 'id="qn-lh-h"', "Tavern board")).toBe(true);
  });

  it("drops in the plain view too, once, the hit's under the bounty, and draws nothing without one", () => {
    for (const spot of ["other", "hit", "fire", "learning", "beacon"] as const) expect(draw(spot, false).match(/test-badge/g)).toHaveLength(1);
    expect(between(draw("hit", false), 'aria-label="Most asked"', 'id="qn-fires-h"')).toBe(true);
    expect(draw(null)).not.toContain("test-badge");
  });
});

// Lands for you (QS.15; quests spec "Lands for you"): beside the heading of
// Campfires, the Lore and Lighthouses, what the section's act would land for
// the reader, from their own standing. With no standing the rail is absent;
// with the catalogue stubbed out it shows the points and the tier only.
describe("Lands for you on the Quests page", () => {
  const draw = (gameOn: boolean, learnShare: LearnShareStanding | null) =>
    renderToStaticMarkup(<QuestsView page={full} party={[]} now={NOW} actions={actions} gameOn={gameOn} setGameStyle={ok} learnShare={learnShare} />);
  const rail = (html: string, tone: "fire" | "learn" | "beacon") => html.match(new RegExp(`<aside class="qn-loot qn-loot--${tone}"[\\s\\S]*?</aside>`))?.[0] ?? "";
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  it("reads +100 · Gold III → Gold II by the fires, Fire keeper II at the reader's own count, and the Title they hold", () => {
    const fire = rail(draw(true, STANDING), "fire");
    expect(fire).toContain('aria-label="What this lands for you, only you see this"');
    expect(text(fire)).toContain("Lands for you · only you see this");
    expect(text(fire)).toMatch(/\+100 points [\s\S]*Gold III → to Gold II · 25 to Gold I/);
    expect(text(fire)).toContain("Fire keeper II rare 1 of 5");
    expect(text(fire)).toContain("Title to wear: Fire keeper · you have it");
    // The lock, the helms and the badge's locked mark are the game's.
    expect(fire).toContain("<svg");
    expect(fire).toContain("qn-loot-helm");
  });

  it("stands beside the Lore and the Lighthouses too, each with its own act", () => {
    const html = draw(true, STANDING);
    // A learning keeps the reader in Gold III, so the rail says the place once and how far is left.
    expect(text(rail(html, "learn"))).toMatch(/\+10 points [\s\S]*Gold III · 40 to Gold II/);
    expect(text(rail(html, "learn"))).not.toContain("Gold III → to Gold III");
    expect(text(rail(html, "learn"))).toContain("Lorewright I common");
    expect(rail(html, "learn")).not.toMatch(/of \d|finds it|Title to wear/);
    expect(text(rail(html, "beacon"))).toMatch(/Gold III → to Platinum IV · new tier · the rank-up fills the screen/);
    expect(text(rail(html, "beacon"))).toContain("Lighthouse rare finds it");
    expect(text(rail(html, "beacon"))).toContain("Keeper of the light I epic 0 of 3");
    // One Beacon finds Lighthouse, so that is the Title the act offers.
    expect(text(rail(html, "beacon"))).toContain("Title to wear: Lighthouse");
    expect(text(rail(html, "beacon"))).not.toContain("you have it");
    expect(html.match(/class="qn-loot /g)).toHaveLength(3);
  });

  it("speaks plainly with the game style off: no lock, no helm, no glyph", () => {
    const html = draw(false, STANDING);
    const fire = rail(html, "fire");
    expect(fire).not.toContain("<svg");
    expect(fire).not.toContain("qn-loot-helm");
    expect(text(fire)).toContain("Gold, division III to Gold, division II · 25 to Gold, division I");
    expect(text(fire)).toContain("only you see this");
    expect(html.match(/class="qn-loot /g)).toHaveLength(3);
  });

  it("is absent with no standing", () => {
    expect(draw(true, null)).not.toMatch(/qn-loot|Lands for you|Title to wear/);
  });

  it("with the catalogue stubbed out, shows the points and the tier only and names no badge", () => {
    const html = draw(true, { ...STANDING, lands: noBadges(READER_LANDS) });
    expect(html.match(/class="qn-loot /g)).toHaveLength(3);
    expect(text(rail(html, "fire"))).toMatch(/\+100 points [\s\S]*Gold III → to Gold II/);
    expect(html).not.toMatch(/qn-bd|qn-rar|Title to wear|Fire keeper|Lorewright|Lighthouse(?!s)|Keeper of the light|Hunter/);
  });
});
