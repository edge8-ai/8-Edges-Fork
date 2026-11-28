import { z } from "zod/v4";

// The themes on /team/ideas (W.189, Dave on 8 Oct: "what is thematic or
// repeated"). Each morning the trends routine asks Claude to group the sparks
// and stores one row in company_os.idea_trend_reports; this module is the shape
// of that row's themes and every rule applied to them, as pure functions of the
// rows the page already reads, so they are tested without a database or a model.
//
// The model only proposes groupings. Which sparks exist, who wrote them, and so
// how many people stand behind a theme are facts from the ideas table, decided
// here. A theme the model makes up from ids it was not given, or that one
// person raised alone, is not shown.

export const THEME_KINDS = ["build", "learning"] as const;
export type ThemeKind = (typeof THEME_KINDS)[number];

/** What Claude is asked for, and what a stored theme holds once cleaned. */
export const ideaThemeSchema = z.object({
  kind: z.enum(THEME_KINDS).describe("build for things to make, learning for lessons learned."),
  title: z.string().describe("The theme in a few plain words, at most 70 characters."),
  gist: z.string().describe("One plain sentence saying what the sparks in it have in common, at most 180 characters."),
  ideaIds: z.array(z.string()).describe("The ids of the sparks of this kind that belong to the theme. At least two."),
  relatedIds: z.array(z.string()).describe("Ids of sparks of the OTHER kind on the same subject. Empty when none."),
  repeats: z
    .array(z.object({ ideaIds: z.array(z.string()), label: z.string() }))
    .describe("Pairs of sparks in this theme that ask for the same thing in different words, each with a 2-5 word label. Empty when none."),
});
export type IdeaTheme = z.infer<typeof ideaThemeSchema>;

export const ideaThemesOutput = z.object({ themes: z.array(ideaThemeSchema) });

/** The facts about one spark the rules need; SharedIdea and the trends read both carry them. */
export type ThemeIdea = { id: string; kind: string | null; person_id: string | null; title: string };

export const MAX_THEMES_PER_KIND = 6;
const TITLE_MAX = 70;
const GIST_MAX = 180;
const LABEL_MAX = 40;

function kindOf(idea: ThemeIdea): ThemeKind {
  return idea.kind === "learning" ? "learning" : "build";
}

function cut(text: string, max: number): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/**
 * The model's themes, made true to the sparks: ids it was not given are
 * dropped, a spark of the other kind moves to related, a theme keeps at least
 * two sparks from at least two people, and a repeat must pair two sparks of
 * the theme written by two different people. At most six themes of each kind.
 */
export function cleanThemes(proposed: IdeaTheme[], ideas: ThemeIdea[]): IdeaTheme[] {
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const out: IdeaTheme[] = [];
  const count: Record<ThemeKind, number> = { build: 0, learning: 0 };
  for (const t of proposed) {
    const kind = t.kind;
    const known = [...new Set([...t.ideaIds, ...t.relatedIds])].filter((id) => byId.has(id));
    const ideaIds = known.filter((id) => kindOf(byId.get(id)!) === kind);
    const relatedIds = known.filter((id) => kindOf(byId.get(id)!) !== kind);
    const people = new Set(ideaIds.map((id) => byId.get(id)!.person_id).filter(Boolean));
    if (ideaIds.length < 2 || people.size < 2) continue;
    if (count[kind] >= MAX_THEMES_PER_KIND) continue;
    const repeats = t.repeats
      .map((r) => ({ ideaIds: [...new Set(r.ideaIds)].filter((id) => ideaIds.includes(id)), label: cut(r.label, LABEL_MAX) }))
      .filter((r) => r.ideaIds.length === 2 && r.label && byId.get(r.ideaIds[0])!.person_id !== byId.get(r.ideaIds[1])!.person_id);
    const title = cut(t.title, TITLE_MAX);
    const gist = cut(t.gist, GIST_MAX);
    if (!title || !gist) continue;
    count[kind]++;
    out.push({ kind, title, gist, ideaIds, relatedIds, repeats });
  }
  return out;
}

/** A stored row's themes, or null when the row predates W.189 (plain sentences) or does not parse. */
export function readStoredThemes(raw: unknown): IdeaTheme[] | null {
  const parsed = z.array(ideaThemeSchema).safeParse(raw);
  return parsed.success && parsed.data.length > 0 ? parsed.data : null;
}

/**
 * The Innovation cockpit's one-line view of a stored row, from either shape:
 * the weekly sentences written before W.189, or a theme's title and gist.
 */
export function themeLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const structured = readStoredThemes(raw);
  if (structured) return structured.map((t) => `${t.title}: ${t.gist}`);
  return raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0);
}

/** One spark as a theme lists it. */
export type ThemeSpark = { id: string; title: string; who: string; echoes: number };
/** One person behind a theme, for the faces. */
export type ThemePerson = { personId: string; name: string };

export type ThemeView = {
  kind: ThemeKind;
  title: string;
  gist: string;
  sparks: ThemeSpark[];
  people: ThemePerson[];
  pickedUp: number;
  related: number;
  repeats: string[];
};

/**
 * What the page draws for each theme, ordered by how many different people
 * raised it (then how many sparks it holds), never by a score. Inside a theme,
 * the sparks most teammates answered come first, then the newest. A theme
 * whose sparks were archived since the run falls back under two people and is
 * left out.
 */
export function themeViews(
  themes: IdeaTheme[],
  ideas: (ThemeIdea & { submitterName: string; created_at: string })[],
  echoesOf: (ideaId: string) => number,
  pickedUp: (ideaId: string) => boolean,
): ThemeView[] {
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const views: ThemeView[] = [];
  for (const t of themes) {
    const live = t.ideaIds.map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => Boolean(i));
    const people = new Map<string, string>();
    for (const i of live) if (i.person_id && !people.has(i.person_id)) people.set(i.person_id, i.submitterName);
    if (live.length < 2 || people.size < 2) continue;
    const sparks = live
      .map((i) => ({ id: i.id, title: i.title, who: i.submitterName, echoes: echoesOf(i.id), at: i.created_at }))
      .sort((a, b) => b.echoes - a.echoes || b.at.localeCompare(a.at))
      .map(({ at: _at, ...s }) => s);
    views.push({
      kind: t.kind,
      title: t.title,
      gist: t.gist,
      sparks,
      people: [...people].map(([personId, name]) => ({ personId, name })),
      pickedUp: live.filter((i) => pickedUp(i.id)).length,
      related: t.relatedIds.filter((id) => byId.has(id)).length,
      repeats: t.repeats.filter((r) => r.ideaIds.every((id) => byId.has(id))).map((r) => r.label),
    });
  }
  return views.sort((a, b) => b.people.length - a.people.length || b.sparks.length - a.sparks.length);
}

/** How many sparks no theme of their own kind holds, for the section's footnote. */
export function unthemedCount(themes: IdeaTheme[], ideas: ThemeIdea[]): number {
  const held = new Set(themes.flatMap((t) => [...t.ideaIds, ...t.relatedIds]));
  return ideas.filter((i) => !held.has(i.id)).length;
}
