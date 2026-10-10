import { fillPrompt } from "@/kernel/ai/prompts";
import { brandPreamble, callWriterModel } from "../writer/model";
import { WRITER_LETTER_GATHER_PROMPT } from "./step-gather.prompt";
import { saveNotes, type DataPoint } from "./data";
import { gatherSources } from "./sources";
import type { StepRunner } from "./types";
import { z } from "zod/v4";

// Step 1: the week, as dated data points with their sources. The model reads
// the raw material (journal, events, meeting summaries from the last ten
// days) and returns five to eight facts worth a sentence in a letter, each
// tied to a date and a source. Passes with at least three, at least one from
// the last seven days. Client names never make it out of this step.

export const letterGatherOutput = z.object({
  points: z.array(z.object({
    date: z.string().describe("YYYY-MM-DD the fact belongs to."),
    fact: z.string().describe("One or two plain sentences, first person, specific: places, numbers, what happened. No client or client-company names; describe people by role and place."),
    source: z.string().describe("Which source item it came from (its title)."),
  })).describe("Five to eight data points, most recent first."),
});

export const runGather: StepRunner = async ({ letter, profile }) => {
  const items = await gatherSources(10);
  if (items.length === 0) return { ok: false, error: "Gather: nothing in the last ten days (no events, meeting summaries or journal entries)." };

  const system = fillPrompt(WRITER_LETTER_GATHER_PROMPT.system, { preamble: brandPreamble(profile) });
  const user = items.map((i) => `## ${i.date} · ${i.kind} · ${i.title}\n${i.text}`).join("\n\n");

  const r = await callWriterModel({ step: "letter-gather", prompt: WRITER_LETTER_GATHER_PROMPT, system, user, schema: letterGatherOutput });
  if (!r.ok) return r;
  const points = (r.data.points ?? []).filter((p) => p.fact?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  if (points.length < 3) return { ok: false, error: `Gather: only ${points.length} usable data point(s); the letter needs at least three.` };
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  if (!points.some((p) => p.date >= weekAgo)) return { ok: false, error: "Gather: no data point from the last seven days." };

  const saved = await saveNotes(letter, { gathered: points, gatheredAt: new Date().toISOString() });
  if (!saved.ok) return saved;
  return { ok: true, summary: `${points.length} data points from ${items.length} source items.` };
};
