// Lighthouses' words, game or plain (QS.6; Khoa's game style rule,
// 2026-10-21). Pure, beside campfire-words.ts. With the game style on, the
// section is Lighthouses, as version 10 drew it; off, it says the same move in
// plain words, with no horizon, sea, moon or lighthouse, and no art. The plain
// words are placeholders until QS.14's artboard is approved. Nothing here
// counts views, likes or reach, and nothing names anyone who has not lit one.

export type LighthouseWords = {
  /** The reader, as their own lighthouse names them. */
  you: string;
  title: string;
  why: string;
  /** The night horizon and its lighthouses: the game's only. */
  art: boolean;
  /** The button that opens the form. */
  light: string;
  /** The line beside it. */
  lightWhy: string;
  /** The line where a Beacon would stand while none is lit. */
  empty: string;
  /** Its bold half. */
  emptyBold: string;
  /** "<n> Beacons lit", for the horizon's label. */
  litLabel: (n: number) => string;
  /** "Your fire <title> was held" around the title. */
  heldBefore: string;
  heldAfter: string;
  /** The offer on a held fire, and its line. */
  heldLight: string;
  heldWhy: string;
  /** The form. */
  titleLabel: string;
  titlePlaceholder: string;
  urlLabel: string;
  submit: string;
  submitting: string;
  cancel: string;
  /** The tap card. */
  openLink: string;
};

export function lighthouseWords(game: boolean): LighthouseWords {
  const shared = {
    /** The reader, as their own lighthouse names them. */
    you: "You",
    titleLabel: "What did you put out?",
    titlePlaceholder: "A post, a talk, a video",
    urlLabel: "Link to the public thing",
    cancel: "Cancel",
    openLink: "Open link",
    lightWhy: "A post, a talk, a video the world can see.",
    heldWhy: "Publish the recording or a post.",
  };
  return game
    ? {
        ...shared,
        title: "Lighthouses",
        why: "Beacons: a learning taken outside Edge8. Every one lit stands on this horizon; tap one to read it.",
        art: true,
        light: "Light a Beacon",
        empty: "The horizon is dark.",
        emptyBold: "Your Beacon would stand here.",
        litLabel: (n) => `${n} ${n === 1 ? "Beacon" : "Beacons"} lit`,
        heldBefore: "Your fire",
        heldAfter: "was held",
        heldLight: "Light it as a Beacon",
        submit: "Light it",
        submitting: "Lighting…",
      }
    : {
        ...shared,
        title: "Taken outside",
        why: "A learning taken outside Edge8: a post, a talk, a video. Each one shows here with who put it out.",
        art: false,
        light: "Add what you put out",
        empty: "Nothing taken outside yet.",
        emptyBold: "Yours would show here.",
        litLabel: (n) => `${n} taken outside`,
        heldBefore: "Your session",
        heldAfter: "happened",
        heldLight: "Take it outside",
        submit: "Add it",
        submitting: "Saving…",
      };
}
