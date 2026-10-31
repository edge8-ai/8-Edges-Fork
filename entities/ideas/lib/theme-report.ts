import { readOr } from "@/kernel/data/read";
import { selectIdeaTrendReports } from "./reads";
import { readStoredThemes, type IdeaTheme } from "./themes";

export type ThemeReport = { themes: IdeaTheme[]; generatedAt: string };

/**
 * The newest themes report (W.189), or null when there is none yet, the newest
 * predates the structured shape, or the read fails. Every one of those leaves
 * the section on /team/ideas showing its empty state and nothing else on the
 * page depends on it, so a failed read falls back to null by name.
 */
export async function latestThemeReport(): Promise<ThemeReport | null> {
  const row = readOr(
    await selectIdeaTrendReports("themes, generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    "[ideas] latest theme report",
    null,
  ) as { themes: unknown; generated_at: string } | null;
  const themes = row ? readStoredThemes(row.themes) : null;
  return themes && row ? { themes, generatedAt: row.generated_at } : null;
}
