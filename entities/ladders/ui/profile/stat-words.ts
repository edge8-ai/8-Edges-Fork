// What each stat on the profile's strip is called, in the viewer's style
// (LD.6; spec story 58), and how its number is printed. Apart from
// profile-model.ts so the browser's hero takes these words without the badge
// catalogue behind a Title's name.
import type { StatKey } from "../../lib/display-choices";

const GAME_STAT_WORDS: Record<StatKey, string> = {
  hits: "hits landed",
  sparks: "sparks",
  fires: "fires hosted",
  beacons: "beacons lit",
  cards: "cards shipped",
  humanTokens: "Human Tokens shipped",
};

// The plain view's words mirror Quests' plain tally (entities/quests/ui/plain-model.ts).
const PLAIN_STAT_WORDS: Record<StatKey, string> = {
  hits: "answers",
  sparks: "sparks",
  fires: "sessions held",
  beacons: "shared outside",
  cards: "cards shipped",
  humanTokens: "Human Tokens shipped",
};

/** What a stat is called under its number, in the viewer's style. */
export function statWords(key: StatKey, gameOn: boolean): string {
  return (gameOn ? GAME_STAT_WORDS : PLAIN_STAT_WORDS)[key];
}

/** A stat's number as the strip prints it: whole numbers plainly, Human Tokens to at most two places. */
export function statValue(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
