// What each act lands, as the learnShareStanding page slot hands it over
// (QS.15), for the Quests tests: the ladders work these out (lib/lands.ts in
// the ladders entity), and a test here spells them out the way a reader would
// read them. Imported by test files only.
import type { Lands, LandsBadge, LearnShareAct, LearnSharePlace, RarityWord } from "@/entities/ladders";

const ROMAN = ["", "I", "II", "III", "IV"] as const;

/** A place as the ladders word it; the test spells the numerals the page never holds. */
export const place = (tierName: string, division: 1 | 2 | 3 | 4 | null): LearnSharePlace => ({
  tierName,
  division,
  words: { game: division ? `${tierName} ${ROMAN[division]}` : tierName, plain: division ? `${tierName}, division ${ROMAN[division]}` : tierName },
});

export const badge = (name: string, rarity: RarityWord, progress: LandsBadge["progress"]): LandsBadge => ({ name, rarity, progress });

type Spec = { points: number; after: LearnSharePlace; newTier?: boolean; left?: Lands["left"]; badges?: LandsBadge[]; title?: Lands["title"] };

export const lands = ({ points, after, newTier = false, left = null, badges = [], title = null }: Spec): Lands => ({ points, after, newTier, left, badges, title, helm: null });

/** Where the reader stands: at 400, Gold III. */
export const READER_PLACE = place("Gold", 3);

/** What each act lands for a reader at 400, Gold III, who hosted one fire and found Fire keeper I. */
export const READER_LANDS: Record<LearnShareAct, Lands> = {
  hit: lands({ points: 10, after: place("Gold", 3), left: { points: 40, to: place("Gold", 2) }, badges: [badge("Hunter II", "uncommon", { have: 4, at: 10 })], title: { name: "Hunter", held: true } }),
  learning: lands({ points: 10, after: place("Gold", 3), left: { points: 40, to: place("Gold", 2) }, badges: [badge("Lorewright I", "common", null)], title: null }),
  fire: lands({ points: 100, after: place("Gold", 2), left: { points: 25, to: place("Gold", 1) }, badges: [badge("Fire keeper II", "rare", { have: 1, at: 5 })], title: { name: "Fire keeper", held: true } }),
  beacon: lands({
    points: 250,
    after: place("Platinum", 4),
    newTier: true,
    badges: [badge("Lighthouse", "rare", { have: 0, at: 1 }), badge("Keeper of the light I", "epic", { have: 0, at: 3 })],
    title: { name: "Lighthouse", held: false },
  }),
};

/** Where a teammate far up the ladder stands: at 7,777, Challenger I. */
export const MATE_PLACE = place("Challenger", 1);

/** What each act lands for that teammate, with words of their own the reader's page must never carry. */
export const MATE_LANDS: Record<LearnShareAct, Lands> = {
  hit: lands({ points: 10, after: place("Challenger", 1), left: { points: 2_213, to: place("Sovereign", null) }, badges: [badge("Hunter IV", "epic", { have: 88, at: 100 })], title: { name: "Hunter", held: true } }),
  learning: lands({ points: 10, after: place("Challenger", 1), left: { points: 2_213, to: place("Sovereign", null) }, badges: [badge("Lorewright IV", "epic", null)], title: { name: "Lorewright", held: true } }),
  fire: lands({ points: 100, after: place("Challenger", 1), left: { points: 2_123, to: place("Sovereign", null) }, badges: [badge("Fire keeper IV", "legendary", { have: 44, at: 50 })], title: { name: "Fire keeper", held: true } }),
  beacon: lands({ points: 250, after: place("Challenger", 1), left: { points: 1_973, to: place("Sovereign", null) }, badges: [badge("Keeper of the light III", "legendary", { have: 21, at: 25 })], title: { name: "Keeper of the light", held: true } }),
};

/** What the ladders hand over with the catalogue stubbed out: the points and the tier, no badge, no Title. */
export function noBadges(all: Record<LearnShareAct, Lands>): Record<LearnShareAct, Lands> {
  const none = (l: Lands): Lands => ({ ...l, badges: [], title: null });
  return { hit: none(all.hit), learning: none(all.learning), fire: none(all.fire), beacon: none(all.beacon) };
}
