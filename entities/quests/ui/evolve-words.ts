// The Evolve pill's words, game or plain (QS.7; spec "Evolve: an unlock on
// your own learning"; prototype version 10, section 4). Pure, beside
// lore-model.ts and campfire-words.ts. The game words are version 10's. Where
// a fire's points land is said once, by campfire-words (QS.5c: "once someone
// who came is marked", which replaced the artboard's "when someone sits
// down"), and a held fire's Beacon line is the Lighthouses' own, so neither
// can drift from its section. The plain words follow the plain Campfires and
// Taken outside sections (QS.14's placeholders), with no fire or horizon.
import { campfireWords } from "./campfire-words";
import { lighthouseWords } from "./lighthouse-words";

export type EvolveWords = {
  /** The pill's tag while it offers the next step. */
  tag: string;
  /** After the bold count: "3 will try". */
  willTry: string;
  /** The offer at three will try. */
  host: string;
  /** The fire lit: its tag, the bold word, the Host's line and the way to it. */
  litTag: string;
  lit: string;
  hostLine: (points: number | null) => string;
  see: string;
  /** "Fire held Tue 14 Oct · 6 sat by it". */
  held: (day: string, sat: number) => string;
  /** The offer on a held fire, and its line. */
  toBeacon: string;
  toBeaconWhy: string;
  /** The Beacon lit: its tag, the bold word, and where it stands. */
  beaconTag: string;
  beaconLit: string;
  beaconWhere: string;
  /** The Host's notes on a held fire: a learning they write. */
  taught: string;
  taughtLabel: string;
  taughtPlaceholder: string;
  taughtDone: string;
  /** The Host's notes sent empty. */
  taughtEmpty: string;
  /** The offer drawn where the page has no way to host. */
  hostUnavailable: string;
  cancel: string;
};

export function evolveWords(game: boolean): EvolveWords {
  const fire = campfireWords(game);
  const lh = lighthouseWords(game);
  const hostLine = (points: number | null) => `You host · ${fire.hostLine(points)}`;
  const shared = {
    willTry: "will try",
    hostLine,
    toBeacon: lh.heldLight,
    toBeaconWhy: lh.heldWhy,
    taughtLabel: "What did you teach?",
    taughtPlaceholder: "What did you teach? One line.",
    taughtEmpty: "Write what you taught first, in one line.",
    hostUnavailable: "Hosting is not available here.",
    cancel: "Cancel",
  };
  return game
    ? {
        ...shared,
        tag: "Evolve",
        host: "Host a 20-minute fire on this",
        litTag: "Fire",
        lit: "Lit.",
        see: "See it at Campfires",
        held: (day, sat) => `Fire held ${day} · ${sat} sat by it`,
        beaconTag: "Beacon",
        beaconLit: "Lit.",
        beaconWhere: "It stands on the horizon.",
        taught: "Write what you taught",
        taughtDone: "Written. It's in the Lore.",
      }
    : {
        ...shared,
        tag: "Take it further",
        host: "Host a 20-minute session on this",
        litTag: "Session",
        lit: "Has a time.",
        see: `See it under ${fire.title}`,
        held: (day, sat) => `Session held ${day} · ${sat} came`,
        beaconTag: lh.title,
        beaconLit: "Added.",
        beaconWhere: `It shows under ${lh.title}.`,
        taught: "Write what you taught",
        taughtDone: "Written. It's in Learnings.",
      };
}
