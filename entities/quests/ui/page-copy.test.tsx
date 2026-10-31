import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LearnShareStanding } from "@/entities/ladders";
import type { HeadCard, QuestCard, QuestsPage } from "../lib/quests-read";
import type { Campfires } from "../lib/campfires-model";
import type { Lore } from "../lib/lore";
import type { Lighthouses } from "../lib/lighthouse-model";
import { NO_CAMPFIRES } from "../lib/campfires-model";
import { campfireWords } from "./campfire-words";
import { NO_LIGHTHOUSES } from "../lib/lighthouse-model";
import type { BeaconActions, CampfireActions, LoreActions, QuestActions } from "./actions-type";
import { place, READER_LANDS } from "./lands-fixtures";
import { dropWords } from "./lands-words";
import { LORE_EMPTY, loreWords, sharedLine } from "./lore-model";
import { lighthouseWords } from "./lighthouse-words";
import { PLAIN_BOARD, PLAIN_WHY, questWords } from "./plain-model";
import { QUEST_WHY, QUESTS_SUB, TAVERN_EMPTY, TAVERN_WHY } from "./quests-model";
import { NEXT_MOVE_WORDS } from "./next-move-model";
import { GameStyleContext } from "./game-style";

// The Quests page in version 10's order, and the glossary scan (QS.14; quests
// spec "The page" and "The glossary scan"). The page is rendered as the server
// draws it, in both game styles, empty and with rows for made-up people.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { QuestsView } = await import("./QuestsView");
const { SummonDrawer } = await import("./SummonDrawer");
const { ActDrop } = await import("./ActDrop");

const ok = async () => ({ ok: true as const });
const actions = { summonBounty: ok, acceptQuest: ok, turnIn: ok, handBack: ok, reactToTurnIn: ok, closeQuest: ok, withdrawQuest: ok } as unknown as QuestActions;
const loreActions = { shareLearning: ok, willTry: ok } as unknown as LoreActions;
const campfireActions: CampfireActions = { raiseHand: ok, lowerHand: ok, lightFire: ok, takeSeat: ok, leaveSeat: ok };
const beaconActions: BeaconActions = { lightBeacon: ok };
const NOW = "2026-10-24T03:00:00.000Z";

const me = { personId: "me", name: "Kim Dao", initials: "KD" };
const mai = { personId: "mai", name: "Mai Tran", initials: "MT" };
const duc = { personId: "duc", name: "Duc Vo", initials: "DV" };
const hoa = { personId: "hoa", name: "Hoa Le", initials: "HL" };

const head = (over: Partial<HeadCard> = {}): HeadCard => ({ id: "h1", position: 1, ask: "One prompt that saved you an hour", closesAt: "2026-10-27T10:00:00.000Z", closed: false, hits: 7, hp: 61, verdict: null, lit: [mai, duc], mine: null, ...over });
const bounty = (over: Partial<QuestCard> = {}): QuestCard => ({
  id: "q1", kind: "bounty", title: "One prompt that saved you an hour", ask: null, giver: hoa, state: "open", learning: false, required: false,
  partySize: 18, monster: "dragon", heads: [head()], hp: 61, isGiver: false, isMine: false, giverParty: null, ...over,
});

/** A page with a row in every section: a boss, two bounties on the board (one the reader is called on, one closed), fires, learnings and Beacons. */
const FULL = {
  page: {
    season: { name: "Q4 2026", hits: 12, campfires: 2, beacons: 1, discoveries: 5 },
    boss: bounty({ heads: [head({ mine: { standing: "called", late: false, turnInText: null, reacted: false } })] }),
    board: [
      bounty({ id: "q2", title: "Send me one client question you couldn't answer", giver: mai, partySize: 4, monster: "slime", heads: [head({ id: "h2", hp: 75, hits: 1, lit: [duc], mine: { standing: "called", late: false, turnInText: null, reacted: false } })], hp: 75 }),
      bounty({ id: "q3", title: "Name one tool you'd cut", giver: duc, state: "closed", partySize: 3, monster: "slime", heads: [head({ id: "h3", closed: true, hp: 67, hits: 1, verdict: "got_away", lit: [mai], mine: { standing: "missed", late: false, turnInText: null, reacted: false } })], hp: 67 }),
    ],
    me,
  } satisfies QuestsPage,
  campfires: {
    wanted: [
      { key: "prompt evals", topic: "prompt evals", hands: 4, mine: false },
      { key: "figma to code", topic: "Figma to code", hands: 2, mine: true },
    ],
    burning: [
      { questId: "r1", title: "Claude for client decks", host: hoa, youHost: false, startsAt: "2026-10-29T09:00:00.000Z", seats: 2, faces: [duc], seated: true, sessionHref: null, endedAt: null },
      { questId: "r2", title: "Lark bots", host: me, youHost: true, startsAt: "2026-10-30T09:00:00.000Z", seats: 0, faces: [], seated: false, sessionHref: null, endedAt: null },
    ],
  } satisfies Campfires,
  lore: {
    firstSpark: false,
    entries: [
      { id: "l1", author: me, mine: true, title: "Agree what done means before the work", postedAt: "2026-10-23T02:00:00.000Z", willTry: 3, youWillTry: false },
      { id: "l2", author: mai, mine: false, title: "Record the demo before the call", postedAt: "2026-10-20T03:00:00.000Z", willTry: 1, youWillTry: true },
    ],
  } satisfies Lore,
  lighthouses: {
    lit: [{ questId: "b1", title: "Slides from the Saigon meetup", url: "https://example.com/talk", author: mai, mine: false }],
    heldFires: [{ questId: "r3", title: "Prompt evals", originIdeaId: null }],
    beacons: { lit: 0, canLight: true },
  } satisfies Lighthouses,
};

/** The reader at 400 points, Gold III, as the learnShareStanding slot hands it over (QS.13, QS.15). */
const STANDING: LearnShareStanding = {
  ...place("Gold", 3), points: 400, divisionStart: 375, next: { ...place("Gold", 2), start: 450 },
  pointsFor: { hit: 10, learning: 10, fire: 100, beacon: 250 },
  reaches: {
    hit: { ...place("Gold", 3), newTier: false },
    learning: { ...place("Gold", 3), newTier: false },
    fire: { ...place("Gold", 2), newTier: false },
    beacon: { ...place("Platinum", 4), newTier: true },
  },
  helm: <span className="test-helm">helm</span>,
  lands: READER_LANDS,
};

const EMPTY_PAGE: QuestsPage = { season: { name: "Q4 2026", hits: 0, campfires: 0, beacons: 0, discoveries: 0 }, boss: null, board: [], me };
const EMPTY_LORE: Lore = { entries: [], firstSpark: true };

function draw(gameOn: boolean, full: boolean, standing: LearnShareStanding | null = STANDING): string {
  return renderToStaticMarkup(
    <QuestsView
      page={full ? FULL.page : EMPTY_PAGE}
      party={[]}
      now={NOW}
      actions={actions}
      gameOn={gameOn}
      setGameStyle={ok}
      lore={full ? FULL.lore : EMPTY_LORE}
      loreActions={loreActions}
      campfires={full ? FULL.campfires : NO_CAMPFIRES}
      campfireActions={campfireActions}
      lighthouses={full ? FULL.lighthouses : NO_LIGHTHOUSES}
      beaconActions={beaconActions}
      learnShare={standing}
      beacons
    />,
  );
}

/**
 * The words a reader meets on the page: the text, and the attributes a screen
 * reader or a pointer says aloud (aria-label, title, placeholder, alt).
 * Markup, class names and links are not copy.
 */
function copyOf(html: string, marks = false): string {
  const said = [...html.matchAll(/\s(?:aria-label|title|placeholder|alt)="([^"]*)"/g)].map((m) => `‖ ${m[1]} ‖`);
  // With marks, every tag leaves a ‖, so an excused phrase can be one whole
  // piece of text (a button that says only "Share") and nothing larger.
  const text = html.replace(/<[^>]+>/g, marks ? " ‖ " : " ");
  return [text, ...said]
    .join(marks ? " ‖ " : " \n ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

const SCENES = [
  { name: "the game style, empty", html: () => draw(true, false) },
  { name: "the game style, with rows", html: () => draw(true, true) },
  { name: "the plain view, empty", html: () => draw(false, false) },
  { name: "the plain view, with rows", html: () => draw(false, true) },
  { name: "the game style, with rows and no ladders", html: () => draw(true, true, null) },
  { name: "the plain view, with rows and no ladders", html: () => draw(false, true, null) },
];

describe("the Quests page in version 10's order (QS.14)", () => {
  const SECTIONS_GAME = ['class="qn-next"', 'class="qs-season"', 'aria-label="Boss bounty"', 'id="qn-fires-h"', 'id="qn-lore-h"', 'id="qn-lh-h"', 'id="qs-board-h"'];

  it("stands the sections in order with rows: next move, season, arena, Campfires, the Lore, Lighthouses, the tavern board last", () => {
    const html = draw(true, true);
    const at = SECTIONS_GAME.map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps the plain view's sections in the same order", () => {
    const html = draw(false, true);
    const at = ['class="qn-next"', 'class="qs-season"', 'aria-label="Most asked"', 'id="qn-fires-h"', 'id="qn-lore-h"', 'id="qn-lh-h"', 'id="qg-board-h"'].map((s) => html.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("titles the tavern board with what it holds and draws no filter chips", () => {
    const html = draw(true, true);
    const board = html.slice(html.indexOf('aria-labelledby="qs-board-h"'));
    expect(copyOf(board)).toContain("Tavern board Optional bounties: asks from teammates that you can take on.");
    expect(board).not.toMatch(/qs-chip|qs-filters|aria-pressed|Filter quests/);
    expect(board.match(/<article class="qs-q/g)).toHaveLength(2);
  });

  it("explains the empty page from top to bottom, every section in its own line, with no season banner", () => {
    const html = draw(true, false);
    expect(html).not.toContain("qs-season");
    const said = copyOf(html);
    const lines = [
      "Open right now. Each one climbs your Learn & Share ladder.",
      "No monster on the loose.",
      "Nobody has raised a hand yet. Name something you want to learn below.",
      "No fire is lit. Light a wanted one above, or raise a hand for what you want to learn.",
      "No learnings yet. Share the first thing you learned this week.",
      "The horizon is dark. Your Beacon would stand here.",
      "The tavern board is quiet. Summon a quest to post an ask anyone can take on.",
    ];
    for (const line of lines) expect(said).toContain(line);
    const at = lines.map((l) => said.indexOf(l));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("keeps one Summon on the empty page, the arena's, and puts it in the head while a boss is open", () => {
    const empty = draw(true, false);
    expect(empty.match(/qs-summon-btn/g)).toHaveLength(1);
    expect(empty.indexOf("qs-summon-btn")).toBeGreaterThan(empty.indexOf('aria-label="Boss bounty"'));
    const full = draw(true, true);
    expect(full.match(/qs-summon-btn/g)).toHaveLength(1);
    expect(full.indexOf("qs-summon-btn")).toBeLessThan(full.indexOf('class="qn-next"'));
  });

  it("shows no season banner in the plain view either while every count is zero", () => {
    expect(draw(false, false)).not.toContain("qs-season");
  });
});

// --- The glossary scan -------------------------------------------------------

const ROOT = join(__dirname, "..", "..", "..");
const GLOSSARIES = ["entities/quests/GLOSSARY.md", "entities/ladders/GLOSSARY.md"];

/** Every word or phrase a glossary lists under _Avoid_, with its qualifier dropped ("rank (as a noun about a person)" is "rank"). */
function avoidedIn(path: string): string[] {
  const md = readFileSync(join(ROOT, path), "utf8");
  return [...md.matchAll(/^_Avoid_:\s*(.+)$/gm)].flatMap((m) =>
    m[1]!
      .replace(/\([^)]*\)/g, "")
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * What the ladders spec and the badge catalogue ban besides the glossaries:
 * no XP, score or streak, nobody made to feel behind, no "only 3 more!" and no
 * "almost there", and rarity never a share of people (ladders spec stories
 * 48-49; ladders badges, "Locked-state copy pattern").
 */
const BANNED: { name: string; pattern: RegExp }[] = [
  { name: "XP", pattern: /\bxp\b/i },
  { name: "streak", pattern: /\bstreaks?\b/i },
  { name: "behind", pattern: /\bbehind\b/i },
  { name: "almost there", pattern: /\balmost there\b/i },
  { name: "only n more", pattern: /\bonly \d+ more\b/i },
  { name: "hurry", pattern: /\bhurry\b/i },
  { name: "don't lose", pattern: /\bdon'?t lose\b/i },
  { name: "others have", pattern: /\bothers have\b/i },
  { name: "you haven't", pattern: /\byou haven'?t\b/i },
  { name: "not yet earned", pattern: /\bnot (?:yet )?earned\b/i },
  { name: "a person level", pattern: /\blevel \d+\b/i },
  { name: "a share of people", pattern: /\d+\s*%\s*of\s+(?:the\s+)?(?:people|team|company|everyone|teammates)\s+(?:hold|have found|found|own)\b|\bheld by\s+\d+\s*%/i },
];

// The states a reader can call up beyond the first render (review of #2310):
// the Giver's own view of a required Hydra, every Standing on a head, a boss
// defeated and one that got away, the Summon drawer, and the drops where an
// act landed. Their titles and turn-ins use no avoided word, so a hit is
// always the page's own copy.
const turnedIn = (over: Partial<NonNullable<HeadCard["mine"]>> = {}) => ({ standing: "turned_in" as const, late: false, turnInText: "Done, see the doc.", reacted: false, ...over });
const STATES: QuestsPage = {
  season: { name: "Q4 2026", hits: 12, campfires: 2, beacons: 1, discoveries: 5 },
  // The reader gave this required Hydra, so they see who they called (ADR 0020).
  boss: bounty({
    id: "hydra", title: "Get the retreat ready", required: true, isGiver: true, monster: "hydra", partySize: 2, giver: me,
    heads: [
      head({ id: "hh1", position: 1, ask: "Send your flight times", hp: 50, hits: 1, lit: [mai] }),
      head({ id: "hh2", position: 2, ask: "Name one thing to learn there", closesAt: "2026-10-29T10:00:00.000Z", hp: 100, hits: 0, lit: [] }),
    ],
    giverParty: { called: 2, members: [{ ...mai, lit: false, headsIn: 1, heads: 2 }, { ...duc, lit: false, headsIn: 0, heads: 2 }] },
  }),
  board: [
    bounty({ id: "s1", title: "Send me one client question you couldn't answer", giver: mai, partySize: 4, monster: "slime", heads: [head({ id: "s1h", hp: 50, hits: 2, lit: [me, duc], mine: turnedIn({ reacted: true }) })], hp: 50 }),
    bounty({ id: "s2", title: "Name one tool you'd cut from our stack", giver: duc, partySize: 3, monster: "slime", heads: [head({ id: "s2h", hp: 67, hits: 1, lit: [mai], mine: { standing: "handed_back", late: false, turnInText: null, reacted: false } })], hp: 67 }),
    bounty({ id: "s3", title: "One thing you would change in onboarding", giver: hoa, required: true, partySize: 12, monster: "big_slime", heads: [head({ id: "s3h", hp: 92, hits: 1, lit: [duc], mine: { standing: "called", late: false, turnInText: null, reacted: false } })], hp: 92 }),
    bounty({ id: "s4", title: "Your best prompt for client minutes", giver: mai, state: "closed", partySize: 3, monster: "slime", heads: [head({ id: "s4h", closed: true, hp: 0, hits: 3, verdict: "defeated", lit: [me, duc, hoa], mine: turnedIn({ late: true }) })], hp: 0 }),
    bounty({ id: "s5", title: "A demo you liked this month", giver: duc, state: "closed", partySize: 3, monster: "slime", heads: [head({ id: "s5h", closed: true, hp: 67, hits: 1, verdict: "got_away", lit: [mai], mine: { standing: "missed", late: false, turnInText: null, reacted: false } })], hp: 67 }),
    bounty({ id: "s6", title: "Our tone for client mail", giver: me, isGiver: true, partySize: 2, monster: "slime", heads: [head({ id: "s6h", hp: 50, hits: 1, lit: [duc] })], hp: 50, giverParty: { called: 2, members: null } }),
  ],
  me,
};
/** A boss at its close: taken down, or got away. */
const closedBoss = (verdict: "defeated" | "got_away"): QuestsPage => ({
  ...FULL.page,
  boss: bounty({ state: "closed", heads: [head({ closed: true, hp: verdict === "defeated" ? 0 : 61, verdict, mine: turnedIn() })], hp: verdict === "defeated" ? 0 : 61 }),
});

function drawPage(page: QuestsPage, gameOn: boolean): string {
  return renderToStaticMarkup(
    <QuestsView page={page} party={[mai, duc, hoa]} now={NOW} actions={actions} gameOn={gameOn} setGameStyle={ok} lore={FULL.lore} loreActions={loreActions} campfires={FULL.campfires} campfireActions={campfireActions} lighthouses={FULL.lighthouses} beaconActions={beaconActions} learnShare={STANDING} beacons />,
  );
}

/** A Bounty Claude drafted (QS.9): the person's own words, quoted back in the banner, use no avoided word. */
const DRAFT = { title: "Watch the launch", note: "Turn in one thing you noticed.", learning: true, partyPersonIds: ["mai", "duc"], heads: [{ ask: "Watch the launch", date: "2026-10-30", time: "18:00" }], from: "give everyone a quest to watch the launch by Friday" };

function drawDrawer(gameOn: boolean, summonerIsManager: boolean, draft: typeof DRAFT | null = null): string {
  return renderToStaticMarkup(
    <GameStyleContext.Provider value={gameOn}>
      <SummonDrawer open onClose={() => {}} party={[me, mai, duc, hoa]} me={me} now={NOW} actions={actions} summonerIsManager={summonerIsManager} draft={draft} />
    </GameStyleContext.Provider>,
  );
}

/** Every drop an act can leave, as the sections hand it over: a learning, a fire just lit, a Beacon into a new tier, and the Lore's line with no ladders. */
function drawDrops(gameOn: boolean): string {
  const drops = [dropWords(READER_LANDS.learning, gameOn), dropWords(READER_LANDS.fire, gameOn, campfireWords(gameOn).landsWhen), dropWords(READER_LANDS.beacon, gameOn), { points: sharedLine(gameOn, null).text, tier: null }];
  return renderToStaticMarkup(
    <>
      {drops.map((d, i) => d && <ActDrop key={i} drop={{ key: i, ...d }} game={gameOn} glyph="bounty" />)}
    </>,
  );
}

/** The reader's own learnings in every Evolve state (QS.7): a fire to host, a fire lit, a fire held, and a Beacon lit. */
function drawEvolve(gameOn: boolean): string {
  const own = (id: string) => ({ id, author: me, mine: true, title: `Learning ${id}`, postedAt: "2026-10-20T03:00:00.000Z", willTry: 3, youWillTry: false });
  const lore: Lore = {
    firstSpark: false,
    entries: ["e1", "e2", "e3", "e4"].map(own),
    evolve: {
      e1: { step: "fire", willTry: 3 },
      e2: { step: "lit", questId: "r1" },
      e3: { step: "held", questId: "r2", title: "Learning e3", heldAt: "2026-10-14T09:20:00.000Z", sat: 4 },
      e4: { step: "beacon", questId: "b1" },
    },
  };
  return renderToStaticMarkup(
    <QuestsView page={EMPTY_PAGE} party={[]} now={NOW} actions={actions} gameOn={gameOn} lore={lore} loreActions={loreActions} beaconActions={beaconActions} evolveActions={{ hostFireOnLearning: ok }} learnShare={STANDING} />,
  );
}

const STATE_SCENES = [true, false].flatMap((on) => {
  const style = on ? "the game style" : "the plain view";
  return [
    { name: `${style}: the Giver's required Hydra and every Standing on the board`, html: () => drawPage(STATES, on) },
    { name: `${style}: a boss taken down`, html: () => drawPage(closedBoss("defeated"), on) },
    { name: `${style}: a boss that got away`, html: () => drawPage(closedBoss("got_away"), on) },
    { name: `${style}: the Summon drawer, a manager's`, html: () => drawDrawer(on, true) },
    { name: `${style}: the Summon drawer, anyone's`, html: () => drawDrawer(on, false) },
    { name: `${style}: the Summon drawer with Claude's draft`, html: () => drawDrawer(on, false, DRAFT) },
    { name: `${style}: the drops where an act landed`, html: () => drawDrops(on) },
    { name: `${style}: the Evolve pill in every state`, html: () => drawEvolve(on) },
  ];
});

/**
 * The page's own phrases that carry a word an _Avoid_ list names, each for a
 * reason the glossaries themselves give. An _Avoid_ list names the words not
 * to use for that one term, and these phrases use the word for something else.
 * The phrase is read from the constant the page draws it from wherever there
 * is one, and only the phrase is excused: the same word anywhere else fails.
 */
const lh = { game: lighthouseWords(true), plain: lighthouseWords(false) };
const plainWords = questWords(false);
const SAID_ON_PURPOSE: { phrase: string | RegExp; reason: string }[] = [
  { phrase: QUESTS_SUB, reason: "The page head (version 10). A Bounty is defined in the glossary as an ask that would otherwise be lost in chat." },
  { phrase: QUEST_WHY, reason: "The empty arena (version 10): what a quest is, in the glossary's own words, with the reminder a Bounty really sends before its due time." },
  { phrase: PLAIN_WHY, reason: "The empty plain view (QS.11): the same line with the plain words." },
  { phrase: TAVERN_WHY, reason: "The tavern board's line (version 10 and the ticket): Optional bounties are asks." },
  { phrase: TAVERN_EMPTY, reason: "The empty tavern board (version 10): posting an ask is what Summon does." },
  { phrase: "Learn & Share", reason: "The ladder's own name (ADR 0021); Wear's avoid is about wearing." },
  { phrase: "Learn and share", reason: "The page's eyebrow, the ladder's name in words." },
  { phrase: lh.game.lightWhy, reason: "A Beacon's Turn-in is a post, a talk, a micro-session (glossary, Beacon)." },
  { phrase: lh.game.titlePlaceholder, reason: "The Beacon form's placeholder: the glossary's kinds of Beacon." },
  { phrase: lh.game.heldWhy, reason: "A held fire offers its Beacon: putting the recording outside is what a Beacon is." },
  { phrase: lh.plain.why, reason: "Taken outside's line (QS.6): the glossary's kinds of Beacon." },
  { phrase: `${NEXT_MOVE_WORDS.ladder} `, reason: "The next move's label: the ladder's own name (ADR 0021)." },
  { phrase: /‖ Share (?:one|another) learning ‖/, reason: "The next move's act (QS.13): sharing a learning is the Lore's act; Wear's avoid is about wearing." },
  ...[loreWords(true, 10).share, loreWords(false, 10).share, loreWords(true, null).share].map((share) => ({ phrase: `‖ ${share} ‖`, reason: "The Lore composer's button (QS.4), with its points or, with no ladders, alone." })),
  { phrase: LORE_EMPTY, reason: "The empty Lore (version 10): sharing a learning is the Lore's act." },
  ...[plainWords.post, plainWords.postTitle].map((post) => ({ phrase: `‖ ${post} ‖`, reason: "Post is the plain view's word for Summon (QS.11, approved): the drawer's button and the page's." })),
  { phrase: "‖ A note to the party (optional) ‖", reason: "The Summon drawer: the Giver's opening note on a Bounty; Discovery's avoid is about calling a learning a note." },
  { phrase: "‖ an ask with a date ‖", reason: "The plain drawer's Bounty kind (QS.11): a Bounty is an ask, in the glossary's own words." },
  { phrase: /‖ Head \d+ ask ‖/, reason: "The drawer's label for one head: a Head is one ask inside a Bounty (glossary, Head)." },
  { phrase: `‖ ${PLAIN_BOARD.why} ‖`, reason: "The plain board's line (QS.14, the approved plain artboard): Optional bounties are asks." },
  { phrase: `‖ ${PLAIN_BOARD.empty} ‖`, reason: "The empty plain board (QS.14, the approved plain artboard): posting an ask is what Post a quest does." },
  { phrase: `‖ ${plainWords.pick} ‖`, reason: "The plain drawer's party label (QS.11, approved): the people a Bounty asks." },
  { phrase: "‖ Each part of the ask ‖", reason: "The plain view's label on a Hydra's plants (QS.11): a Head is one ask inside a Bounty (glossary, Head)." },
  { phrase: /‖ Closed (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} \w{3}(?:, \d\d:\d\d)? ‖/, reason: "A quest that closed by its due time: the glossary's own word (Missed, Late); Withdrawn's avoid is about a quest taken back." },
  { phrase: /‖ Closed before your answer ‖/, reason: "The plain view's Missed (QS.11, approved), seen by its owner alone." },
  { phrase: /‖ From your ask: “[^”]*”\. ‖/, reason: "The draft banner (QS.9, the prototype Khoa approved 2026-10-27): the person's own instruction, quoted back as theirs." },
  { phrase: `‖ Nobody is ${plainWords.asked} until you press ${plainWords.post}. Change anything first. ‖`, reason: "The plain draft banner (QS.9): Post is the plain view's word for Summon." },
];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole word or phrase, plural included, and never part of a hyphenated glossary term ("rank" is not "Rank-up"). */
function wordPattern(phrase: string): RegExp {
  return new RegExp(`(?<![\\w-])${escape(phrase).replace(/ /g, "\\s+")}(?:s|es)?(?![\\w-])`, "i");
}

/** The terms the glossaries define (their bold headings), lower-cased: "Points", "Badge". */
function termsIn(path: string): string[] {
  const md = readFileSync(join(ROOT, path), "utf8");
  return [...md.matchAll(/^\*\*(.+?)\*\*:/gm)].map((m) => m[1]!.trim().toLowerCase());
}

/**
 * Every avoided word, less the ones another entry in the same glossaries
 * defines as its own term: Hit avoids "point", and Points is the Ladders' term
 * for what the reader earns; Emblem avoids "badge", and Badge is a term. A
 * term's own name is never an avoided word.
 */
function avoidedWords(): string[] {
  const terms = new Set(GLOSSARIES.flatMap(termsIn).flatMap((t) => [t, t.replace(/s$/, "")]));
  return [...new Set(GLOSSARIES.flatMap(avoidedIn))].filter((w) => !terms.has(w));
}

/** The copy with each excused phrase cut out, so a word it carries is read nowhere else. */
function excuse(copy: string): string {
  return SAID_ON_PURPOSE.reduce((c, { phrase }) => c.split(typeof phrase === "string" ? phrase : new RegExp(phrase.source, "g")).join(" ¦ "), copy);
}

/** What the scan finds in one rendering: each avoided word with the words around it. */
function scan(raw: string): string[] {
  const copy = excuse(raw.replace(/[‘’]/g, "'"));
  const found: string[] = [];
  const at = (name: string, m: RegExpMatchArray | null) => {
    if (m?.index !== undefined) found.push(`${name}: "…${copy.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30)}…"`);
  };
  for (const w of avoidedWords()) at(w, copy.match(wordPattern(w)));
  for (const b of BANNED) at(b.name, copy.match(b.pattern));
  return found;
}

const ALL_SCENES = [...SCENES, ...STATE_SCENES];

describe("the glossary scan (QS.14)", () => {
  it("reads both glossaries' Avoid lists", () => {
    const words = avoidedWords();
    for (const w of ["rank", "level", "frame", "leaderboard", "deadline", "xp", "ask", "share", "post", "closed"]) expect(words).toContain(w);
  });

  it("excuses only phrases that carry an avoided word and that the page still says, so a stale entry cannot hide a word", () => {
    const words = avoidedWords();
    const copies = ALL_SCENES.map((s) => copyOf(s.html(), true).replace(/[‘’]/g, "'"));
    for (const { phrase } of SAID_ON_PURPOSE) {
      const matcher = typeof phrase === "string" ? (c: string) => (c.includes(phrase) ? phrase : null) : (c: string) => c.match(phrase)?.[0] ?? null;
      const said = copies.map(matcher).find((m) => m !== null);
      expect(said, `${String(phrase)} is no longer on the page`).toBeTruthy();
      expect(words.some((w) => wordPattern(w).test(said!)), `${String(phrase)} carries no avoided word`).toBe(true);
    }
  });

  it("catches a word or a phrase the lists ban, and not a glossary term that contains one", () => {
    expect(scan("Your rank this week")).toHaveLength(1);
    expect(scan("Wear a frame round your face")).toHaveLength(1);
    expect(scan("Only 3 more to go, almost there")).toHaveLength(2);
    expect(scan("Fire keeper · 12% of people hold it")).toHaveLength(1);
    expect(scan("Don’t lose it")).toHaveLength(1);
    expect(scan("Gold III → Platinum IV · new tier · the rank-up fills the screen")).toEqual([]);
  });

  it("fails on an excused word said anywhere but in its phrase", () => {
    for (const line of ["Share your rank", "An ask from Hoa", "Closed early", "A reminder for you", "Post your talk"]) expect(scan(line), line).not.toEqual([]);
  });

  it("reaches the states it names, so the scan reads their words", () => {
    const states = copyOf(drawPage(STATES, true));
    for (const said of ["Hit landed", "Handed back", "Got away", "· required", "Hydra"]) expect(states, said).toContain(said);
    expect(copyOf(drawPage(STATES, false))).toContain("Closed before your answer");
    expect(copyOf(drawDrops(true))).toContain("New tier: Platinum");
    expect(copyOf(drawDrops(false))).toContain("+100 points once someone who came is marked");
    expect(copyOf(drawDrawer(true, true))).toContain("Required for everyone called");
  });

  it.each(ALL_SCENES)("finds no avoided word on $name", ({ html }) => {
    expect(scan(copyOf(html(), true))).toEqual([]);
  });
});
