import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { companyOs } from "@/kernel/data/supabase";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { cleanThemes, ideaThemesOutput, type IdeaTheme, type ThemeIdea } from "../themes";
import { IDEA_TRENDS_PROMPT } from "./idea-trends.prompt";

// The themes running across the team's sparks (W.189): what the team keeps
// raising, grouped by kind (things to build, lessons learned), for the "What
// the team keeps raising" section on /team/ideas and the "Trends across ideas"
// card on the Innovation cockpit. Same never-throws contract as the other
// lib/ai helpers: returns null on any failure (no key, too little material, an
// API error) so the caller keeps the last report.
//
// The model sees each spark as a short reference (s1, s2, …) and its author as
// another (p1, p2, …), never a database id or a name: fewer tokens, nothing to
// invent, and no person's name sent to answer a question about ideas. The refs
// are mapped back, and cleanThemes decides what stands (two sparks from two
// people at least).

export const IDEA_TRENDS_CLASS: AiDataClass = "B";
// It runs inside the idea-themes cron, whose maxDuration is 300 s (Y.39, Y.67.3).
const AI = aiSite({ site: "idea-trends", dataClass: IDEA_TRENDS_CLASS, tier: "fast", routeSeconds: 300 });
const MODEL = AI.model;
const LOOKBACK_DAYS = 180;
const MAX_IDEAS = 150;
const MIN_IDEAS = 4; // fewer than this, there is no theme to find

export type IdeaTrends = { themes: IdeaTheme[]; sourceCount: number; model: string };

const SCHEMA = jsonSchemaFor(ideaThemesOutput);

type TrendRow = ThemeIdea & { office: string | null; takeaway: string | null; problem: string | null };

/** The material line for one spark, exported for its test. */
export function materialLine(ref: string, author: string, row: TrendRow): string {
  const line = (row.takeaway ?? row.problem ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  return `- ${ref} by ${author} [${row.kind === "learning" ? "learning" : "build"}${row.office ? `, ${row.office}` : ""}] ${row.title}${line ? ` — ${line}` : ""}`;
}

/** The model's refs back to ids; refs it was not given are dropped. Exported for its test. */
export function fromRefs(themes: IdeaTheme[], idOf: Map<string, string>): IdeaTheme[] {
  const map = (refs: string[]) => refs.map((r) => idOf.get(r.trim())).filter((id): id is string => Boolean(id));
  return themes.map((t) => ({
    ...t,
    ideaIds: map(t.ideaIds),
    relatedIds: map(t.relatedIds),
    repeats: t.repeats.map((r) => ({ ...r, ideaIds: map(r.ideaIds) })),
  }));
}

export async function generateIdeaTrends(): Promise<IdeaTrends | null> {
  const anthropic = AI.clientIfConfigured();
  if (!anthropic) return null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data, error } = await companyOs
    .from("ideas")
    .select("id, kind, person_id, title, office, takeaway, problem, created_at")
    .neq("status", "archived")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_IDEAS);
  if (error) return null;

  const rows = (data ?? []) as TrendRow[];
  if (rows.length < MIN_IDEAS) return null;

  const idOf = new Map<string, string>();
  const authorRef = new Map<string, string>();
  const material = rows
    .map((r, i) => {
      const ref = `s${i + 1}`;
      idOf.set(ref, r.id);
      const key = r.person_id ?? `none-${i}`;
      if (!authorRef.has(key)) authorRef.set(key, `p${authorRef.size + 1}`);
      return materialLine(ref, authorRef.get(key)!, r);
    })
    .join("\n");

  try {
    const response = await anthropic.messages.create({
      prompt: IDEA_TRENDS_PROMPT,
      model: MODEL,
      // Up to twelve themes, each listing refs and a sentence, run past 2,000
      // tokens; a truncated reply fails to parse, so leave plenty of room.
      max_tokens: 4000,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          // The instruction leads the user message; the site sends no system
          // prompt (see ./idea-trends.prompt).
          content: fillPrompt(IDEA_TRENDS_PROMPT.user, { material }),
        },
      ],
    });
    const out = readStructuredOutput("idea-trends", MODEL, response, ideaThemesOutput);
    if (!out.ok) {
      console.error("idea-trends:", out.error);
      return null;
    }
    const themes = cleanThemes(fromRefs(out.data.themes, idOf), rows);
    if (themes.length === 0) return null;
    return { themes, sourceCount: rows.length, model: MODEL };
  } catch (err) {
    console.error("idea-trends:", err instanceof Error ? err.message : err);
    return null;
  }
}
