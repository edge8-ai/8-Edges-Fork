// The Monday Innovation report (the Lark notifications plan, 2026-11-18): the
// ideas shared this week, the themes the idea-themes routine already found,
// one theme to double down on and a runner-up, and how many ideas this quarter
// are still undecided. It rides in Monday's Operations morning list rather
// than a chat of its own, so the Operations chat still gets one message.
//
// A name appears only beside an idea that person chose to share: credit, never
// a register of who did not post (TH.7.1).

import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import type { AiDataClass } from "@/kernel/ai/routing";
import { fillPrompt } from "@/kernel/ai/prompts";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { GREETING_COLUMNS, greetingName, type GreetedPerson } from "@/kernel/config/people-name";
import { one } from "@/kernel/config/embedded";
import { latestThemeReport } from "./theme-report";
import type { IdeaTheme } from "./themes";
import { INNOVATION_WEEKLY_PROMPT } from "./innovation-weekly.prompt";

export const INNOVATION_WEEKLY_CLASS: AiDataClass = "B";
const AI = aiSite({ site: "innovation-weekly", dataClass: INNOVATION_WEEKLY_CLASS, tier: "standard" });
const IDEAS_HREF = "/admin/innovation/ideas";

export const innovationPickOutput = z.object({
  doubleDown: z.object({ theme: z.string(), why: z.string() }),
  runnerUp: z.object({ theme: z.string(), why: z.string() }),
});
export type InnovationPick = z.infer<typeof innovationPickOutput>;
const SCHEMA = jsonSchemaFor(innovationPickOutput);

type Line = { who: string | null; text: string; href?: string };
type Section = { title: string; lines: Line[] };
type IdeaRow = { id: string; title: string; person_id: string | null; status: string; created_at: string; people: GreetedPerson | GreetedPerson[] | null };

/** The first day of the calendar quarter holding `today`. */
export function quarterStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(q).padStart(2, "0")}-01`;
}

/** One line per theme for the prompt: title, size, people, newest date, gist. */
export function themeLine(theme: IdeaTheme, ideas: Map<string, IdeaRow>): string {
  const rows = theme.ideaIds.map((id) => ideas.get(id)).filter((r): r is IdeaRow => !!r);
  const people = new Set(rows.map((r) => r.person_id).filter(Boolean)).size;
  const newest = rows.map((r) => r.created_at.slice(0, 10)).sort().at(-1) ?? "unknown";
  return `${theme.title} | ${theme.ideaIds.length} ideas | ${people} people | newest ${newest} | ${theme.gist}`;
}

async function pickFor(lines: string[]): Promise<InnovationPick | null> {
  const anthropic = AI.clientIfConfigured();
  if (!anthropic || lines.length === 0) return null;
  try {
    const response = await anthropic.messages.create({
      prompt: INNOVATION_WEEKLY_PROMPT,
      model: AI.model,
      max_tokens: 800,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: fillPrompt(INNOVATION_WEEKLY_PROMPT.user, { themes: lines.join("\n") }) }],
    });
    const out = readStructuredOutput("innovation-weekly", AI.model, response, innovationPickOutput);
    return out.ok ? out.data : null;
  } catch {
    return null;
  }
}

/**
 * The Innovation sections for Monday's Operations list. `decider` is who picks
 * up, parks or drops an idea. Throws on a failed read; with no stored themes or
 * no AI the report still lists the week's ideas and the undecided count.
 */
export async function innovationWeeklySections(today: string, decider: string): Promise<{ sections: Section[]; aiFailed: boolean }> {
  const weekAgo = addDays(today, -7);
  const { data, error } = await companyOs
    .from("ideas")
    .select(`id, title, person_id, status, created_at, people(${GREETING_COLUMNS})`)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`[innovation-weekly] ideas: ${error.message}`);
  const ideas = (data ?? []) as IdeaRow[];
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const quarter = ideas.filter((i) => i.created_at.slice(0, 10) >= quarterStart(today));
  const fresh = ideas.filter((i) => i.created_at.slice(0, 10) >= weekAgo);
  const undecided = quarter.filter((i) => i.status === "new").length;

  const report = await latestThemeReport();
  const themes = (report?.themes ?? []).filter((t) => t.ideaIds.length > 0).sort((a, b) => b.ideaIds.length - a.ideaIds.length);
  const pick = await pickFor(themes.map((t) => themeLine(t, byId)));

  const sections: Section[] = [
    {
      title: "Innovation: new this week",
      lines: fresh.length
        ? fresh.map((i) => ({ who: greetingName(one(i.people), "Someone"), text: `shared "${i.title.slice(0, 140)}".`, href: IDEAS_HREF }))
        : [{ who: null, text: `No new ideas this week. ${quarter.length} so far this quarter.` }],
    },
  ];
  if (themes.length) {
    sections.push({ title: "Innovation: themes", lines: themes.slice(0, 6).map((t) => ({ who: null, text: `${t.title} (${t.ideaIds.length})` })) });
  }
  if (pick) {
    sections.push({
      title: "Innovation: double down",
      lines: [
        { who: null, text: `${pick.doubleDown.theme}. ${pick.doubleDown.why}` },
        { who: null, text: `Runner-up: ${pick.runnerUp.theme}. ${pick.runnerUp.why}` },
      ],
    });
  }
  if (undecided > 0) {
    sections.push({
      title: "Innovation: not moving",
      lines: [{ who: decider, text: `${undecided} of this quarter's ideas have no decision. Pick up, park or drop the three oldest.`, href: IDEAS_HREF }],
    });
  }
  return { sections, aiFailed: themes.length > 0 && !pick };
}
