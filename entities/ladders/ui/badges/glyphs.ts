// The badges' glyphs (LD.7b): one stroke drawing on a 24 grid per kind of
// badge, from the approved ladders prototype's set (its IC table) with the
// few the catalogue needed beyond it. A family shares its glyph across tiers,
// because the tier is in the name and the rarity in the ring; the catalogue's
// icon line ("A short sword with 1 notch") stays the brief for a later
// drawing of each. Pure data, so the browser may load it.

const PATHS = {
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  slime: "M5 19c0-8 3-13 7-13s7 5 7 13zM10 13v1M14 13v1M10.5 16.5q1.5 1 3 0",
  fire: "M12 3c2 3 5 4.5 5 8a5 5 0 0 1-10 0c0-2 1-3.5 2.5-4.5 0 2 1 3 2 3 0-2.5-1-4 .5-6.5zM5 21l14-2.5M5 18.5 19 21",
  book: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12M9 8h6M9 11h4",
  sword: "M14.5 3.5H20v5.5l-9.5 9.5-5.5-5.5zM4 15l5 5M3 21l3-3",
  quill: "M3 6c3-1 6-1 9 1 3-2 6-2 9-1v13c-3-1-6-1-9 1-3-2-6-2-9-1zM12 7v13",
  light: "M10 21l1-13h2l1 13zM9 8h6M12 4v4M15 6l5-2.5M15 8l5 2.5",
  hidden: "M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.8V15M12 18.5v.5",
  hydra: "M6 21v-6c0-3 2-4 2-7M12 21V9c0-2 1-4 1-6M18 21v-6c0-3-2-4-2-7M6 8l2-1M13 3l2 0M16 8l2-1",
  lift: "M12 3v5M8 8h8l-1 4H9zM6 15h12v6H6z",
  anvil: "M3 8h12c0 3 2.5 4 6 4v2H9c0-2-1-3-6-3zM9 14v4M15 14v4M6 20h12",
  hammer: "M13 4l7 7-3 3-7-7zM11.5 8.5l-8 8 3 3 8-8",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  arch: "M4 21v-8a8 8 0 0 1 16 0v8M9.5 4.6l1 3.4h3l1-3.4M8 21v-7a4 4 0 0 1 8 0v7",
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  star: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z",
  circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  tankard: "M5 7h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM15 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2M6 7a2.5 2.5 0 0 1 4-2 2.5 2.5 0 0 1 4 2",
  scroll: "M7 4h11a2 2 0 0 1 0 4H8M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10V8M10 12h5M10 16h3",
  shield: "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
  bubble: "M4 5h16v11H9l-5 4zM12 13s-3-1.8-3-3.6a1.5 1.5 0 0 1 3-.6 1.5 1.5 0 0 1 3 .6c0 1.8-3 3.6-3 3.6z",
  satchel: "M4 9h16v11H4zM9 9V6a3 3 0 0 1 6 0v3M4 13h16",
  scale: "M12 4v16M7 20h10M4 8h16M4 8l-2 6a3 3 0 0 0 4 0zM20 8l-2 6a3 3 0 0 0 4 0z",
  flag: "M5 21V4M5 4h12l-3 4 3 4H5",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  box: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
} as const;

export type Glyph = keyof typeof PATHS;

/** A family's glyph, by its name in the catalogue. */
const FAMILY: Record<string, Glyph> = {
  Hunter: "sword",
  Lorewright: "quill",
  Stargazer: "star",
  Summoner: "circle",
  "Tavern keeper": "tankard",
  "Fire keeper": "fire",
  "Keeper of the light": "light",
  "Hydra tamer": "hydra",
  Scribe: "scroll",
  "Tried and true": "shield",
  Anvil: "anvil",
  "Heavy lift": "lift",
  "Sealed scroll": "scroll",
  Blueprint: "map",
  Keystone: "arch",
  Cartographer: "map",
  Starforged: "star",
  "Twin crowns": "crown",
};

/** A one-off's glyph, by its id; one not named here draws the spark. */
const ONE_OFF: Record<string, Glyph> = {
  "first-hit": "slime",
  "spark-struck": "spark",
  "first-page": "book",
  "seat-by-the-fire": "fire",
  "ill-try-that": "satchel",
  "summoners-circle": "circle",
  "free-sword": "sword",
  "kind-word": "bubble",
  lighthouse: "light",
  "carried-the-flame": "light",
  "cold-fire-warm-hands": "fire",
  "the-call-answered": "bell",
  "hydra-summoner": "hydra",
  "lore-request": "scroll",
  "dragons-scale": "shield",
  bestiary: "book",
  "three-paths": "map",
  footnotes: "book",
  unstuck: "sword",
  "built-upon": "star",
  homework: "satchel",
  embers: "fire",
  "campfire-tale": "scroll",
  "wandering-scholar": "book",
  "both-sides-of-the-board": "flag",
  "first-strike": "hammer",
  weighed: "scale",
  "under-the-banner": "flag",
  "word-kept": "hammer",
  "guild-contract": "scroll",
  "town-crier": "bell",
  "path-clearer": "hammer",
  artefact: "box",
  "shared-anvil": "anvil",
  guildhalls: "flag",
  "deep-foundations": "arch",
  "both-hands": "quill",
  "dream-forged": "star",
  "two-trades": "anvil",
  "every-road": "star",
  duel: "sword",
  "all-heads-bow": "hydra",
  "swapped-seats": "fire",
  "kind-for-kind": "tankard",
  "proven-in-the-field": "shield",
  "spark-to-flame": "spark",
  feather: "scale",
  phoenix: "fire",
  cathedral: "arch",
  "well-read": "book",
};

/** The glyph a badge draws: its family's, else its own, else the spark. */
export function glyphOf(badge: { id: string; family: string | null }): Glyph {
  return (badge.family ? FAMILY[badge.family] : undefined) ?? ONE_OFF[badge.id] ?? "spark";
}

/** The stroke path of a glyph, on a 24 grid. */
export const glyphPath = (glyph: Glyph): string => PATHS[glyph];

/** Every glyph a badge may name, for the test that each one draws. */
export const GLYPHS = Object.keys(PATHS) as Glyph[];
