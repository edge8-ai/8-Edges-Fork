// The words and small decisions of the Quests page's plain view (QS.11; the
// game style switched off). Pure, beside quests-model.ts, which the arena
// keeps. The plain view draws the same quests from the same read model, with
// the same audience rules: only the people who answered are ever named, and
// nothing counts who has not. What changes is the picture and the words. A
// bounty grows the kernel's Sprout, a leaf for each tenth of the people asked
// who answered and a bloom when all have, instead of a monster losing HP; and
// the game's words (Summon, hits, Tavern board, Boss) become plain ones.
// Bounty, Raid and Beacon stay: they are the glossary's names for what a
// quest is, not part of the game.
import { PLANT_BLOOM_AT, sproutStage } from "@/kernel/ui/Sprout";
import type { HeadCard, QuestCard, QuestKind, QuestsPage, Standing } from "../lib/quests-read";
import { campfireWords } from "./campfire-words";
import { lighthouseWords } from "./lighthouse-words";

/** What a quest is, said once on the empty page, in the plain view's words. */
export const PLAIN_WHY = "A quest is an ask that would otherwise get lost in chat. Post one and the people you ask find it here, with a reminder before it is due.";

const KIND_WORD: Record<QuestKind, string> = { bounty: "Bounty", raid: "Raid", beacon: "Beacon" };

/** The share of the people asked who have answered: HP read the other way round. */
export function answeredShare(hp: number): number {
  return 100 - Math.max(0, Math.min(100, hp));
}

/** How many things have fed the plant: a tenth of the people asked is a leaf, all of them a bloom. */
export function plantFed(hp: number): number {
  return Math.round((answeredShare(hp) * PLANT_BLOOM_AT) / 100);
}

/**
 * The line under one plant. While the quest is open it is the plant's own
 * stage. At the close it is how the head ended, said the plant's way: a head
 * the arena calls defeated bloomed, and one that got away grew this far. A
 * plant never wilts, so neither line is a loss.
 */
export function plantLine(state: QuestCard["state"], head: Pick<HeadCard, "hp" | "verdict">): string {
  if (state === "withdrawn") return "Withdrawn";
  if (state === "closed") return head.verdict === "defeated" ? "It bloomed" : "It grew this far";
  return sproutStage(plantFed(head.hp));
}

/** The type line on a card: the kind, its parts when it has more than one, and whether it is required. */
export function kindLine(card: Pick<QuestCard, "kind" | "heads" | "required">): string {
  const parts = card.kind === "bounty" && card.heads.length >= 2 ? ` · ${card.heads.length} parts` : "";
  return `${KIND_WORD[card.kind]}${parts}${card.required ? " · required" : ""}`;
}

/** The answer count: across the parts when there is more than one, so it never reads as a count of people. */
export function answersLine(answers: number, parts: number): string {
  const words = `${answers} ${answers === 1 ? "answer" : "answers"}`;
  return parts >= 2 ? `${words} across ${parts} parts` : words;
}

/** The company's tally in plain words; the numbers are the season banner's, the whole company's, never a person's. */
export function plainTally(season: QuestsPage["season"]): { tone: "bounty" | "raid" | "beacon" | "page"; n: number; words: string }[] {
  return [
    { tone: "bounty", n: season.hits, words: season.hits === 1 ? "answer" : "answers" },
    { tone: "raid", n: season.campfires, words: season.campfires === 1 ? "session held" : "sessions held" },
    { tone: "beacon", n: season.beacons, words: "shared outside" },
    { tone: "page", n: season.discoveries, words: season.discoveries === 1 ? "learning" : "learnings" },
  ];
}

/** The reader's own standing in plain words. A Missed is still seen by its owner alone (ADR 0020). */
export const PLAIN_STANDING_LABEL: Record<Standing, string> = {
  called: "Asked",
  accepted: "Accepted",
  turned_in: "Answered",
  handed_back: "Handed back",
  missed: "Closed before your answer",
};

/** The moves', the Summon drawer's and Campfires' words, game or plain, chosen by the reader's game style. */
export function questWords(game: boolean) {
  const words = game
    ? { turnedIn: "Hit landed.", turnedInToast: "Hit! Your turn-in landed.", post: "Summon", posting: "Summoning…", postTitle: "Summon a quest", posted: "Summoned.", asked: "called", pick: "Call the party" }
    : { turnedIn: "Answered.", turnedInToast: "Answered. Your turn-in is in.", post: "Post", posting: "Posting…", postTitle: "Post a quest", posted: "Posted.", asked: "asked", pick: "Who to ask" };
  return { ...words, campfires: campfireWords(game), lighthouses: lighthouseWords(game) };
}
