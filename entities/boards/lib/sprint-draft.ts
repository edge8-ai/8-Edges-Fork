import { aiSite } from "@/kernel/ai/gateway";
import { SPRINT_DRAFT_PROMPT } from "./sprint-draft.prompt";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { z } from "zod/v4";

// The theme and goal proposed for a sprint the Tuesday routine opens (WS-01).
// The team names a sprint after what the week is for ("Sprint 3 - Customers
// and Orders UX") and writes a one-line goal, and the routine has to open the
// sprint before the planning meeting that would normally decide both. So it
// proposes them from what is on the board, and the team rewrites either in the
// sprint brief. A board with nothing open, a missing key or a failed call all
// come back empty: the sprint still opens, just without a theme or goal.

const SITE = "sprint-draft";
export const SPRINT_DRAFT_CLASS: AiDataClass = "B";
const AI = aiSite({ site: SITE, dataClass: SPRINT_DRAFT_CLASS, tier: "fast" });
const MODEL = AI.model;

export type SprintDraft = { theme: string | null; goal: string | null };

type SprintDraftInput = {
  board: string;
  description: string | null;
  client: string | null;
  previous: { name: string; goal: string | null } | null;
  // The open cards, highest priority first: what the goal should speak to.
  open: { title: string; priority: string }[];
  // What the previous sprint finished, so the goal carries the story on.
  finished: string[];
};

const OPEN_LIMIT = 40;
const FINISHED_LIMIT = 20;

export const sprintDraftOutput = z.object({
  theme: z.string().nullable().describe("Two to five words in Title Case naming what the week is for, with no punctuation. null when the cards do not suggest one."),
  goal: z.string().nullable().describe("One or two plain sentences saying what will be true at the end of the week, specific to the open cards. null when the cards do not suggest one."),
});

const SCHEMA = jsonSchemaFor(sprintDraftOutput);

function describe(input: SprintDraftInput): string {
  const lines = [`Board: ${input.board}${input.client ? ` (client: ${input.client})` : ""}`];
  if (input.description) lines.push(`About the board: ${input.description}`);
  if (input.previous) {
    lines.push(`Previous sprint: ${input.previous.name}${input.previous.goal ? ` (goal: ${input.previous.goal})` : ""}`);
  }
  if (input.finished.length) {
    lines.push("Finished in the previous sprint:", ...input.finished.slice(0, FINISHED_LIMIT).map((t) => `- ${t}`));
  }
  lines.push("Open cards, highest priority first:", ...input.open.slice(0, OPEN_LIMIT).map((c) => `- [${c.priority.toUpperCase()}] ${c.title}`));
  return lines.join("\n");
}

// The house style bans em dashes in copy; a model told so still writes one now
// and then, and the sprint name is read every day of the week.
const clean = (s: unknown): string | null => (typeof s === "string" && s.trim() ? s.replace(/\s*—\s*/g, ", ").trim() : null);
// A theme sits after "Sprint N - ", so it must not carry its own separator or
// trailing punctuation, and it should stay a name, not a sentence.
const cleanTheme = (s: unknown): string | null => {
  const t = clean(s)?.replace(/\s+-\s+/g, " ").replace(/[.:;,!?]+$/, "").trim() ?? null;
  return t && t.length <= 60 ? t : null;
};

export async function draftSprint(input: SprintDraftInput): Promise<SprintDraft> {
  const none: SprintDraft = { theme: null, goal: null };
  if (input.open.length === 0) return none;
  try {
    const llm = AI.clientIfConfigured();
    if (!llm) return none;
    const response = await llm.messages.create({
      model: MODEL,
      max_tokens: 400,
      prompt: SPRINT_DRAFT_PROMPT,
      system: SPRINT_DRAFT_PROMPT.system,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: [{ type: "text", text: describe(input) }] }],
    });
    const out = readStructuredOutput(SITE, MODEL, response, sprintDraftOutput, "The model declined to draft this sprint.");
    if (!out.ok) {
      console.warn(`[sprint-draft] ${input.board}: ${out.error}`);
      return none;
    }
    const parsed = out.data;
    return { theme: cleanTheme(parsed.theme), goal: clean(parsed.goal) };
  } catch (err) {
    console.error(`[sprint-draft] ${input.board} failed:`, err instanceof Error ? err.message : String(err));
    return none;
  }
}
