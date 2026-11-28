import { remark } from "remark";
import remarkHtml from "remark-html";
import type { StrategyRow } from "@/entities/org/lib/company/edges-shared";

// Parsing for the designed Strategy view, shared by /team/strategy and
// /admin/company/strategy. The strategy row's body_md is authored as `##`
// sections; this turns the ones the view knows how to design (Ambition,
// Purpose, Value Proposition, Themes, Business Lines, Overview) into structured
// data, and leaves anything else as prose so admin edits never silently vanish.
export type Section = { heading: string; body: string };

export function parseSections(md: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      if (current) out.push(current);
      current = { heading: h[1].trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) out.push(current);
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

export function parseThemes(body: string): { year: number; title: string }[] {
  return [...body.matchAll(/^[-*]\s+(\d{4}):\s+(.+)$/gm)]
    .map((m) => ({ year: Number(m[1]), title: m[2].trim() }))
    .sort((a, b) => b.year - a.year);
}

export function parseLink(body: string): { label: string; url: string } | null {
  const m = body.match(/\[([^\]]+)\]\((https?:[^)\s]+)\)/);
  return m ? { label: m[1], url: m[2] } : null;
}

export function parseSubsections(body: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^###\s+(.+)$/);
    if (h) {
      if (current) out.push(current);
      current = { heading: h[1].trim(), body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) out.push(current);
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

export const STATEMENT_ICONS: Record<string, string> = {
  ambition: "◆",
  purpose: "◎",
  "value proposition": "✦",
};
export const LINE_ICONS = ["◈", "◐", "☷"];

export type ParsedStrategy = {
  strategy: StrategyRow;
  statements: { label: string; body: string; ico: string }[];
  themes: { year: number; title: string }[];
  currentTheme: { year: number; title: string } | null;
  slides: { label: string; url: string } | null;
  lines: Section[];
  overview: string | null;
  extras: { heading: string; html: string }[];
};

// Everything the view needs, resolved once. Async because unrecognized
// sections are rendered from markdown via remark.
export async function parseStrategy(strategy: StrategyRow): Promise<ParsedStrategy> {
  const sections = strategy.body_md ? parseSections(strategy.body_md) : [];
  const byName = new Map(sections.map((s) => [s.heading.toLowerCase(), s]));

  const statements = ["ambition", "purpose", "value proposition"]
    .map((key) => {
      const s = byName.get(key);
      return s ? { label: s.heading, body: s.body, ico: STATEMENT_ICONS[key] } : null;
    })
    .filter(Boolean) as { label: string; body: string; ico: string }[];

  const themesSection = byName.get("themes");
  const themes = themesSection ? parseThemes(themesSection.body) : [];
  const slides = themesSection ? parseLink(themesSection.body) : null;
  const currentTheme = themes.find((t) => t.year === strategy.year) ?? themes[0] ?? null;

  const linesSection = byName.get("business lines");
  const lines = linesSection ? parseSubsections(linesSection.body) : [];

  // The `## Overview` section is the hero message; the title stays the
  // aspirational line on /admin/edges/goals.
  const overview = byName.get("overview")?.body ?? null;

  const known = new Set(["overview", "ambition", "purpose", "value proposition", "themes", "business lines"]);
  const extraSections = sections.filter((s) => !known.has(s.heading.toLowerCase()));
  const extras = await Promise.all(
    extraSections.map(async (s) => ({
      heading: s.heading,
      html: String(await remark().use(remarkHtml, { sanitize: true }).process(s.body)),
    })),
  );

  return { strategy, statements, themes, currentTheme, slides, lines, overview, extras };
}
