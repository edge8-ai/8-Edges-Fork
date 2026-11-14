// The weekly programme narration (TR.9, spec stories 52 and 53; scope A,
// chosen by Khoa on 2026-11-03). Every Monday the routine reads the programme
// as each viewer sees it, from the same register rows, and keeps a short story
// for each slice the viewer is shown, for that viewer only. Identical figures
// are written once and shared, so a slice two admins both see costs one call.
// A story is kept only when every number in it is one of its figures
// (narration-rules); a rejected draft is not stored and its slice shows
// figures only. Reads raise on failure (rule 2).
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { businessDate, isoWeekKey, isoWeekMonday } from "@/kernel/config/dates";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { accessOf } from "@/kernel/identity/access-of-person";
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { NARRATION_PROMPT } from "./narration.prompt";
import { checkStory, figuresHash, sliceInput, storiesMatching } from "./narration-rules";
import { programmeViewsOf, type ProgrammeAsker, type ProgrammeView } from "./programme-read";
import { PERIODS, type Figures, type Period } from "./programme-read-rules";

export const NARRATION_SITE = "training-programme-narration";
// Counts, the star average and feelings that three or more people gave
// together, never a name or a note: internal business content, class C.
export const NARRATION_CLASS: AiDataClass = "C";

const StoryOutput = z.object({ story: z.string() });

/** The Monday (Vietnam time) of the week `now` falls in: the week a story is for. */
export function storyWeek(now: Date): string {
  const day = businessDate(now);
  return isoWeekMonday(isoWeekKey(day)) ?? day;
}

/** Everyone who reads the programme: the current team members who may open My Team › Training. */
async function viewers(): Promise<ProgrammeAsker[]> {
  const out: ProgrammeAsker[] = [];
  for (const p of await listCurrentTeamPeople()) {
    const access = await accessOf(p.id);
    if (access?.may("training.organise")) out.push({ personId: p.id, may: (permission, target) => access.may(permission, target) });
  }
  return out;
}

type Wanted = { viewerId: string; period: Period; grain: "type" | "plan"; sliceId: string; hash: string; figures: Figures; input: string };

/** The stories this week still needs: every shown slice of every viewer and period without one. */
async function wanted(week: string, now: Date): Promise<Wanted[]> {
  const askers = await viewers();
  if (askers.length === 0) return [];
  const views = await programmeViewsOf(askers, PERIODS.map((period) => ({ period, typeId: null, planId: null })), now);
  const have = mustRows(
    await companyOs.from("training_programme_narrations").select("viewer_id, period, grain, slice_id").eq("week", week).limit(5000),
    "[training] this week's narrations",
  ) as { viewer_id: string; period: string; grain: string; slice_id: string }[];
  const done = new Set(have.map((r) => `${r.viewer_id}|${r.period}|${r.grain}|${r.slice_id}`));
  const out: Wanted[] = [];
  for (const { asker, filter, view } of views) {
    if (view.refused) continue;
    for (const s of view.slices) {
      if (!s.shown || done.has(`${asker.personId}|${filter.period}|${s.grain}|${s.id}`)) continue;
      out.push({ viewerId: asker.personId, period: filter.period, grain: s.grain, sliceId: s.id, hash: figuresHash(s.figures, s, filter.period), figures: s.figures, input: sliceInput(s, filter.period, s.figures) });
    }
  }
  return out;
}

/** One model call: a draft story for one slice's figures. */
async function draft(input: string): Promise<{ ok: true; story: string; model: string } | { ok: false; error: string }> {
  const ai = aiSite({ site: NARRATION_SITE, dataClass: NARRATION_CLASS, tier: "standard" });
  const client = ai.clientIfConfigured();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  try {
    const response = await client.messages.create({
      prompt: NARRATION_PROMPT,
      model: ai.model,
      max_tokens: 600,
      system: NARRATION_PROMPT.system,
      output_config: { effort: "low", format: { type: "json_schema", schema: jsonSchemaFor(StoryOutput) } },
      messages: [{ role: "user", content: fillPrompt(NARRATION_PROMPT.user, { slice: input }) }],
    });
    const out = readStructuredOutput(NARRATION_SITE, ai.model, response, StoryOutput, "The model declined this story.");
    return out.ok ? { ok: true, story: out.data.story, model: ai.model } : out;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type WeekRun = { week: string; wanted: number; written: number; shared: number; rejected: { hash: string; error: string }[]; left: number };

/**
 * One tick of the Monday routine: writes up to `calls` new stories and shares
 * every one already written this week for the same figures. A tick that runs
 * out of calls leaves the rest for the next; rows already written are never
 * written again (the table's one-per-slice rule, and `wanted` skips them).
 */
export async function writeStories(now: Date, calls: number): Promise<WeekRun> {
  const week = storyWeek(now);
  const todo = await wanted(week, now);
  const run: WeekRun = { week, wanted: todo.length, written: 0, shared: 0, rejected: [], left: 0 };
  if (todo.length === 0) return run;
  const hashes = [...new Set(todo.map((w) => w.hash))];
  const prior = mustRows(
    await companyOs.from("training_programme_narrations").select("figures_hash, body, model").eq("week", week).in("figures_hash", hashes).limit(5000),
    "[training] shared narrations",
  ) as { figures_hash: string; body: string; model: string }[];
  const ready = new Map(prior.map((r) => [r.figures_hash, { body: r.body, model: r.model }]));
  const refused = new Set<string>();
  let used = 0;
  for (const w of todo) {
    let story = ready.get(w.hash);
    const shared = Boolean(story);
    if (!story) {
      if (refused.has(w.hash)) continue;
      if (used >= calls) {
        run.left += 1;
        continue;
      }
      used += 1;
      const d = await draft(w.input);
      const checked = d.ok ? checkStory(d.story, w.figures, w.period) : d;
      if (!d.ok || !checked.ok) {
        refused.add(w.hash);
        run.rejected.push({ hash: w.hash, error: checked.ok ? "" : checked.error });
        continue;
      }
      story = { body: checked.body, model: d.model };
      ready.set(w.hash, story);
    }
    const { error } = await companyOs
      .from("training_programme_narrations")
      .upsert(
        { viewer_id: w.viewerId, week, period: w.period, grain: w.grain, slice_id: w.sliceId, figures: w.figures, figures_hash: w.hash, body: story.body, model: story.model },
        { onConflict: "viewer_id,week,period,grain,slice_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`[training] narration write: ${error.message}`);
    if (shared) run.shared += 1;
    else run.written += 1;
  }
  return run;
}

/** A story as a page shows it. */
export type Story = { body: string; week: string };

/**
 * This week's stories beside the slices the reader is shown, by slice key
 * (`type:<id>`, `plan:<id>`): only their own rows, and only where the slice's
 * figures are still the ones the story was written from (storiesMatching).
 */
export async function myStories(viewerId: string, period: Period, view: ProgrammeView, now: Date): Promise<Map<string, Story>> {
  if (view.refused) return new Map();
  const rows = mustRows(
    await companyOs.from("training_programme_narrations").select("grain, slice_id, body, week, figures_hash").eq("viewer_id", viewerId).eq("week", storyWeek(now)).eq("period", period).limit(500),
    "[training] my narrations",
  ) as { grain: string; slice_id: string; body: string; week: string; figures_hash: string }[];
  return storiesMatching(view.slices, period, new Map(rows.map((r) => [`${r.grain}:${r.slice_id}`, { body: r.body, week: r.week, hash: r.figures_hash }])));
}
