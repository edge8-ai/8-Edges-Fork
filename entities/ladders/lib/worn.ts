// wornTiers: for a batch of people, what each chose to wear (LD.1; spec "The
// door"; ADR 0021). The tier word on each ladder, or nothing: never a
// division, a star or a point, and nothing a person hid. A face with no
// border says nothing, so a person with no display row, or with the switch
// off, answers null exactly as someone at the bottom would. Batched so a page
// asks once for every face it draws. With `{ profile: true }` (one id) it adds
// the items that person switched on for their profile, and nothing else.
import { higherTier, placeOn, type BuilderCounts, type Ladder, type LearnShareCounts, type Tier } from "./points";
import { heldTier } from "./recompute";
import type { Banner, DisplayRow, PositionRow, UnlockRow } from "./rows";
import type { WornTiersProvider } from "@/kernel/shell/faces";
import { liveStore, type Store } from "./store";
import { STAT_KEYS, type StatKey } from "./display-choices";

export type WornTiers = { learnShare: Tier | null; builder: Tier | null };
export type { StatKey };

export type WornProfile = WornTiers & {
  banner: Banner;
  /** The id of the badge worn as a title; its name is the catalogue's (LD.7). */
  titleBadge: string | null;
  /** Only the stats switched on, with their values. */
  stats: Partial<Record<StatKey, number>>;
  displayCase: string[];
};

type Rows = { positions: PositionRow[]; unlocks: UnlockRow[]; display: DisplayRow[] };

/** The tier a person holds on a ladder: their highest unlock, or the tier their points reach. */
function tierHeld(rows: Rows, personId: string, ladder: Ladder): Tier | null {
  const unlocked = heldTier(rows.unlocks, personId, ladder);
  const row = rows.positions.find((p) => p.person_id === personId && p.ladder === ladder);
  const reached = row ? placeOn(ladder, row.points).tier : null;
  if (unlocked && reached) return higherTier(ladder, unlocked, reached);
  return unlocked ?? reached;
}

/** Each person's worn tiers from rows; a person with no row, or nothing worn, gets nulls. */
export function shapeWorn(ids: readonly string[], rows: Rows): Map<string, WornTiers> {
  const out = new Map<string, WornTiers>();
  for (const id of ids) {
    const display = rows.display.find((d) => d.person_id === id);
    out.set(id, {
      learnShare: display?.wear_learn_share ? tierHeld(rows, id, "learn_share") : null,
      builder: display?.wear_builder ? tierHeld(rows, id, "builder") : null,
    });
  }
  return out;
}

/** One person's dressed profile from rows: their worn tiers plus what they switched on. */
export function shapeProfile(id: string, rows: Rows): WornProfile {
  const worn = shapeWorn([id], rows).get(id) as WornTiers;
  const display = rows.display.find((d) => d.person_id === id);
  const stats: Partial<Record<StatKey, number>> = {};
  if (display) {
    const ls = rows.positions.find((p) => p.person_id === id && p.ladder === "learn_share")?.counts as LearnShareCounts | undefined;
    const b = rows.positions.find((p) => p.person_id === id && p.ladder === "builder")?.counts as BuilderCounts | undefined;
    const values: Record<StatKey, number> = { hits: ls?.hits ?? 0, sparks: ls?.sparks ?? 0, fires: ls?.fires ?? 0, beacons: ls?.beacons ?? 0, cards: b?.cards ?? 0, humanTokens: b?.humanTokens ?? 0 };
    for (const key of STAT_KEYS) if (display.shown_stats.includes(key)) stats[key] = values[key];
  }
  return { ...worn, banner: display?.banner ?? "meadow", titleBadge: display?.title_badge ?? null, stats, displayCase: display?.display_case ?? [] };
}

/** The tier each person chose to wear on each ladder, the word only. */
export async function wornTiers(ids: readonly string[], opts?: { store?: Store }): Promise<Map<string, WornTiers>>;
/** One person's dressed profile: their worn tiers and the items they switched on. */
export async function wornTiers(ids: readonly [string], opts: { profile: true; store?: Store }): Promise<WornProfile>;
export async function wornTiers(ids: readonly string[], opts: { profile?: true; store?: Store } = {}): Promise<Map<string, WornTiers> | WornProfile> {
  const store = opts.store ?? liveStore;
  const unique = [...new Set(ids)];
  const display = await store.displayOf(unique);
  if (!opts.profile) return wornFrom(store, unique, display);
  // A profile needs the counts behind the stats switched on.
  const [positions, unlocks] = await Promise.all([store.positionsOf(unique), store.unlocksOf(unique)]);
  return shapeProfile(unique[0], { positions, unlocks, display });
}

/** A batch of faces needs a tier only for the people who wear one, and nobody else is read. */
async function wornFrom(store: Store, ids: readonly string[], display: DisplayRow[]): Promise<Map<string, WornTiers>> {
  const toRead = display.filter((d) => ids.includes(d.person_id) && (d.wear_learn_share || d.wear_builder)).map((d) => d.person_id);
  const [positions, unlocks] = toRead.length > 0 ? await Promise.all([store.positionsOf(toRead), store.unlocksOf(toRead)]) : [[], []];
  return shapeWorn(ids, { positions, unlocks, display });
}

/**
 * What the kernel's faces seam asks (LD.4, kernel/shell/faces.ts): each
 * person's worn tiers as this viewer may see them. With the viewer's game
 * style off, nothing: every face they see is plain, whatever its wearer chose
 * (Khoa, 2026-10-21). The viewer's own choice is read in the same query as
 * the wearers', so a page pays one read of the display rows, not two.
 */
export async function wornTiersSeenBy(ids: readonly string[], viewer: { personId: string }, store: Store = liveStore): Promise<Map<string, WornTiers>> {
  const unique = [...new Set(ids)];
  const display = await store.displayOf([...new Set([...unique, viewer.personId])]);
  // A viewer with no row has never turned the game style off, so it is on.
  const gameOn = display.find((d) => d.person_id === viewer.personId)?.game_style ?? true;
  if (!gameOn) return new Map();
  return wornFrom(store, unique, display);
}

/**
 * What the faces seam hears of the worn tiers: the border a face wears is its
 * Learn & Share tier, so only that tier, and only for the people who wear one.
 * A Builder medal never sits beside a face.
 */
export function bordersFrom(worn: ReadonlyMap<string, WornTiers>): Map<string, string> {
  return new Map([...worn].flatMap(([id, tiers]) => (tiers.learnShare ? [[id, tiers.learnShare] as const] : [])));
}

/** The kernel faces seam's provider, as app/shell.ts registers it when ladders is installed. */
export const wornFaces: WornTiersProvider = async (ids, viewer) => bordersFrom(await wornTiersSeenBy(ids, viewer));
