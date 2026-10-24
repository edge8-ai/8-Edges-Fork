// Campfires' words, game or plain (QS.5; Khoa's game style rule, 2026-10-21).
// Pure, beside lore-model.ts and plain-model.ts. With the game style on, the
// section is Campfires, as version 10 drew it; off, it says the same moves in
// plain words, with no fire, flame or smoke, and no art. The plain artboard is
// QS.14's to approve; these words hold its place until then. Nothing here
// counts who has not raised a hand or who did not come, and no line names who
// raised one.
import { handsToGo } from "../lib/campfires-model";

export const WANTED_EMPTY = "Nobody has raised a hand yet. Name something you want to learn below.";

export type CampfireWords = {
  title: string;
  why: string;
  /** The art beside the heading and on each card: the game's only. */
  art: boolean;
  wanted: string;
  wantedWhy: string;
  coldKind: string;
  light: string;
  lighting: string;
  burning: string;
  burningWhy: string;
  burningKind: string;
  burningEmpty: string;
  seated: string;
  /** The Host's own line under a burning fire; the points come from the ladders through the page slot (QS.13), null without them. */
  youHost: (points: number | null) => string;
  /** "hands" after the count on a cold fire card. */
  handsWord: (hands: number) => string;
  /** The cold fire's second span: nobody has taken it on yet. */
  noHost: string;
  /** "2 hands · one more makes a fire", for a topic under three hands. */
  handsLine: (hands: number) => { n: number; words: string };
  /** "4 by the fire", or the line for a fire nobody has sat by yet. */
  seatsLine: (seats: number) => { n: number | null; words: string };
};

const handWord = (n: number) => (n === 1 ? "hand" : "hands");
const more = (n: number) => (handsToGo(n) === 1 ? "one more" : "two more");

export function campfireWords(game: boolean): CampfireWords {
  return game
    ? {
        title: "Campfires",
        why: "Raids: twenty minutes where one of us teaches the rest. Raise a hand for what you want to learn; whoever lights the fire hosts it.",
        art: true,
        wanted: "Wanted",
        wantedWhy: "Topics people raised a hand for. Three hands make a fire.",
        coldKind: "Wanted",
        light: "Light it",
        lighting: "Lighting…",
        burning: "Burning",
        burningWhy: "Upcoming fires. Sit down for any of them.",
        burningKind: "Burning",
        burningEmpty: "No fire is lit. Light a wanted one above, or raise a hand for what you want to learn.",
        seated: "You're by the fire.",
        youHost: (pts) => (pts ? `+${pts} when someone sits down` : "It lands when someone sits down"),
        handsWord: handWord,
        noHost: "no Host yet",
        handsLine: (n) => ({ n, words: `${handWord(n)} · ${more(n)} ${handsToGo(n) === 1 ? "makes" : "make"} a fire` }),
        seatsLine: (n) => (n > 0 ? { n, words: "by the fire" } : { n: null, words: "Be the first by the fire" }),
      }
    : {
        title: "Teach each other",
        why: "Twenty minutes where one of us teaches the rest. Raise a hand for what you want to learn; whoever picks a time hosts it.",
        art: false,
        wanted: "Topics people want to learn",
        wantedWhy: "Three hands and anyone can host it.",
        coldKind: "Ready to host",
        light: "Host it",
        lighting: "Saving…",
        burning: "Sessions with a time",
        burningWhy: "Take a seat at any of them.",
        burningKind: "Has a time",
        burningEmpty: "Nothing has a time yet. Host a topic above, or raise a hand for what you want to learn.",
        seated: "You have a seat.",
        youHost: (pts) => (pts ? `+${pts} points when someone sits down` : "It lands when someone sits down"),
        handsWord: handWord,
        noHost: "nobody hosting it yet",
        handsLine: (n) => ({ n, words: `${handWord(n)} · ${more(n)} and anyone can host it` }),
        seatsLine: (n) => (n > 0 ? { n, words: n === 1 ? "seat taken" : "seats taken" } : { n: null, words: "No seats taken yet" }),
      };
}
