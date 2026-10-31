// Your next move (QS.13; spec "Your next move"; glossary: Next move): the acts
// open to the reader right now, each with the points it earns on their Learn &
// Share ladder and where it would take them, beside their own tier and bar.
// Pure, beside lore-model.ts and campfire-words.ts: NextMove.tsx draws what
// this decides, and the table test holds every case.
//
// The numbers are the ladders', read through the learnShareStanding page slot
// (entities/ladders/slots.ts): the points each act earns, where each act would
// take the reader and whether it crosses into a new tier. Nothing here holds
// the points table or the tier starts. With no standing (a deployment without
// ladders, or a reader whose standing could not be read) the block is absent
// and the cards show no points and no lands line.
//
// The acts, in the prototype's order:
// - Turn in on the Bounty, while the reader has an open head on the boss that
//   they were called on or accepted; once they have turned in and no head is
//   left open it stays, done. A head handed back is an answer, and the strip
//   never asks for it again.
// - Share one learning, or Share another learning once they have shared one.
// - Light the wanted fire on the cold fire with the most hands; with none, the
//   burning fire the reader hosts. A held fire leaves the burning list, so the
//   "landed" state of that card waits for the read of held fires (QS.6).
// - Light a Beacon, once QS.6 ships its button: `beacons` (a boolean) is the seam.
//
// Every string obeys the Quests and Ladders glossaries' Avoid lists: tier and
// division, never the words those lists rule out.
import type { LearnShareAct, LearnSharePlace, LearnShareStanding } from "@/entities/ladders";
import type { Campfires } from "../lib/campfires-model";
import { splitWanted } from "../lib/campfires-model";
import type { HeadCard, QuestCard } from "../lib/quests-read";
import { dueLine, headClosed } from "./quests-model";
import { campfireWords } from "./campfire-words";

export type NextMoveTone = "bounty" | "learn" | "fire" | "beacon";

/**
 * Where a card takes the reader: the element carrying `data-move="<move>"`,
 * which it focuses, or failing that the section it scrolls to.
 */
export type MoveTarget = { move: string | null; section: string };

export type NextMoveCard = {
  key: string;
  act: LearnShareAct;
  tone: NextMoveTone;
  done: boolean;
  name: string;
  hint: string;
  /** The act's points, or null with no standing to read them from. */
  points: number | null;
  /** Where the act would take the reader ("→ Gold II"), with "new tier" when it crosses one; null when done or with no standing. */
  /** What the act lands (the glossary's "Lands for you"): the place it reaches, and whether that is a new tier. */
  lands: { place: string; newTier: boolean } | null;
  go: MoveTarget;
};

/**
 * QS.6's seam: the Beacon card is drawn only once the page can light one. QS.6
 * passes `{ available: true }` from its read when its Light a Beacon button
 * (carrying `data-move="light-beacon"`) is on the page; until then it is null.
 */
/** Whether the page has a Light a Beacon button to name (QS.6 adds it). */
export type BeaconSeam = boolean;

/** A fire the reader hosted that was held: what the fire act's done card names. */
export type HeldFireDone = { questId: string; title: string };

/** The data-move value and section of each move the strip names. */
export const MOVES = {
  turnIn: "turn-in",
  shareLearning: "share-learning",
  lightBeacon: "light-beacon",
  lightTopic: (key: string) => `light-${key}`,
  hostFire: (questId: string) => `host-${questId}`,
} as const;
const SECTIONS = {
  boss: ".qs-feature",
  lore: 'section[aria-labelledby="qn-lore-h"]',
  campfires: 'section[aria-labelledby="qn-fires-h"]',
  lighthouses: '[data-move-section="lighthouses"]',
} as const;

const n = (v: number) => v.toLocaleString("en-US");

/** A place in the reader's style, as the ladders worded it: "Gold II", or plainly "Gold, division II". */
export const placeWords = (p: LearnSharePlace, game: boolean): string => (game ? p.words.game : p.words.plain);

/**
 * The strip's own words, the same in both styles: the game-only words are on
 * the cards (nextMoves) and in placeWords. QS.14's plain artboard may change
 * them.
 */
export const NEXT_MOVE_WORDS = {
  title: "Your next move",
  /** The line under the title names the ladder only when there is one to climb. */
  why: (hasStanding: boolean) => (hasStanding ? "Open right now. Each one climbs your Learn & Share ladder." : "Open right now."),
  ladder: "Learn & Share",
  only: "only you see this",
  points: "points",
  newTier: "new tier",
} as const;

/**
 * The reader's block: their place, their points and where the next division
 * starts ("400 of 450"), and how full the bar is between this division's start
 * and the next. At the open top there is no next, and the bar is full. Null
 * with no standing.
 */
export function readerBlock(s: LearnShareStanding | null, game: boolean): { place: string; points: string; of: string | null; pct: number; label: string } | null {
  if (!s) return null;
  const place = placeWords(s, game);
  if (s.next === null) return { place, points: n(s.points), of: null, pct: 100, label: `${place}, the open top` };
  const span = s.next.start - s.divisionStart;
  const pct = span > 0 ? Math.max(0, Math.min(100, Math.round(((s.points - s.divisionStart) / span) * 100))) : 100;
  return { place, points: n(s.points), of: n(s.next.start), pct, label: `Your points towards ${placeWords(s.next, game)}, which starts at ${n(s.next.start)}` };
}

type Input = {
  boss: QuestCard | null;
  /** The reader has never shared a learning (lore.firstSpark). */
  firstSpark: boolean;
  campfires: Campfires;
  /** The reader's held fires with no Beacon yet, from the Lighthouses read (QS.6): a held fire is the fire act landed. */
  heldFires?: HeldFireDone[];
  beacons: BeaconSeam;
  standing: Pick<LearnShareStanding, "pointsFor" | "reaches"> | null;
  game: boolean;
  now: string;
};

/** The head of the boss the reader still owes: called or accepted, and open. */
function owedHead(boss: QuestCard, now: string): HeadCard | null {
  if (boss.state !== "open") return null;
  return boss.heads.find((h) => (h.mine?.standing === "called" || h.mine?.standing === "accepted") && !headClosed(h, now)) ?? null;
}

/** The acts open to the reader now, in the prototype's order. */
export function nextMoves({ boss, firstSpark, campfires, heldFires = [], beacons, standing, game, now }: Input): NextMoveCard[] {
  const card = (act: LearnShareAct, c: Omit<NextMoveCard, "act" | "points" | "lands">): NextMoveCard => {
    const reach = standing && !c.done ? standing.reaches[act] : null;
    return { ...c, act, points: standing ? standing.pointsFor[act] : null, lands: reach ? { place: placeWords(reach, game), newTier: reach.newTier } : null };
  };
  const out: NextMoveCard[] = [];

  if (boss) {
    const owed = owedHead(boss, now);
    const turnedIn = boss.heads.some((h) => h.mine?.standing === "turned_in");
    const go = { move: MOVES.turnIn, section: SECTIONS.boss };
    if (owed) {
      out.push(card("hit", { key: "bounty", tone: "bounty", done: false, name: game ? "Turn in on the Bounty" : "Answer the Bounty", hint: `${boss.title} · ${dueLine(owed, boss.state, now)}`, go }));
    } else if (turnedIn) {
      const hint = game ? `Hit landed · ${boss.giver.name} will see it` : `${boss.giver.name} will see it`;
      out.push(card("hit", { key: "bounty", tone: "bounty", done: true, name: game ? "Turned in on the Bounty" : "Answered the Bounty", hint, go }));
    }
  }

  out.push(
    card("learning", {
      key: "learning",
      tone: "learn",
      done: false,
      name: firstSpark ? "Share one learning" : "Share another learning",
      hint: "What did you learn this week?",
      go: { move: MOVES.shareLearning, section: SECTIONS.lore },
    }),
  );

  // The cold fire with the most hands; on a tie, the one the section draws first.
  const cold = [...splitWanted(campfires.wanted).cold].sort((a, b) => b.hands - a.hands)[0];
  const hosting = campfires.burning.find((f) => f.youHost && f.endedAt === null);
  // The reader's own fire, over and unmarked (QS.5c): marking who came is what
  // lands it, so it comes before lighting another.
  const toMark = campfires.burning.find((f) => f.youHost && f.endedAt !== null);
  if (toMark) {
    const pts = standing?.pointsFor.fire;
    out.push(
      card("fire", {
        key: "fire",
        tone: "fire",
        done: false,
        name: `Mark who came at ${toMark.title}`,
        hint: campfireWords(game).hostLine(pts ?? null),
        go: { move: MOVES.hostFire(toMark.questId), section: SECTIONS.campfires },
      }),
    );
  } else if (cold) {
    out.push(
      card("fire", {
        key: "fire",
        tone: "fire",
        done: false,
        name: game ? `Light the wanted fire on ${cold.topic}` : `Host the session on ${cold.topic}`,
        hint: `${cold.hands} hands up · you would host`,
        go: { move: MOVES.lightTopic(cold.key), section: SECTIONS.campfires },
      }),
    );
  } else if (hosting) {
    const pts = standing?.pointsFor.fire;
    out.push(
      card("fire", {
        key: "fire",
        tone: "fire",
        done: false,
        name: `You host ${hosting.title}`,
        hint: campfireWords(game).hostLine(pts ?? null),
        go: { move: MOVES.hostFire(hosting.questId), section: SECTIONS.campfires },
      }),
    );
  } else if (heldFires[0]) {
    // The fire act, landed: the reader hosted a fire and someone came. The
    // Lighthouses section is where it goes next (Light it as a Beacon).
    const held = heldFires[0];
    const pts = standing?.pointsFor.fire;
    out.push(
      card("fire", {
        key: "fire",
        tone: "fire",
        done: true,
        name: game ? `You held ${held.title}` : `You hosted ${held.title}`,
        hint: pts ? `+${pts}${game ? "" : " points"} landed` : "It landed",
        go: { move: null, section: SECTIONS.lighthouses },
      }),
    );
  }

  if (beacons) {
    out.push(
      card("beacon", {
        key: "beacon",
        tone: "beacon",
        done: false,
        name: game ? "Light a Beacon" : "Put out a Beacon",
        hint: "A post, a talk, a video the world can see",
        go: { move: MOVES.lightBeacon, section: SECTIONS.lighthouses },
      }),
    );
  }
  return out;
}
