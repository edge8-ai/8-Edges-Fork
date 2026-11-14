// The prep draft (English Program PR 3): the morning before a session, Claude
// builds its plan from the programme philosophy, the last plans, the last
// recap, the teacher's learner notes and the library, and saves it as drafted
// for the organiser to check. A block naming an exercise not in the session's
// library fails validation and the draft is not saved. The input is gathered
// here; nothing in it is a learner's stars, load, skip reason or review
// (ADR 0016): the teacher's note is the teacher's own words.
import { z } from "zod/v4";
import { aiSite } from "@/kernel/ai/gateway";
import { fillPrompt } from "@/kernel/ai/prompts";
import type { AiDataClass } from "@/kernel/ai/routing";
import { jsonSchemaFor, readStructuredOutput } from "@/kernel/ai/response";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { businessDate } from "@/kernel/config/dates";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { Philosophy } from "./philosophy";
import { readSessionPlan, saveBlocks, unknownExercises, type SessionView } from "./session-plan";
import { BlockInput, type BlockInputType } from "./session-plan-rules";
import { minutesBetween, whenLabel } from "./training-format";
import { PREP_DRAFT_PROMPT } from "./prep-draft.prompt";

export const PREP_DRAFT_SITE = "training-prep-draft";
// The teacher's material and notes about the class: internal business content, class C.
export const PREP_DRAFT_CLASS: AiDataClass = "C";

const DraftOutput = z.object({
  blocks: z.array(
    z.object({
      side: z.enum(["presentation", "reactive"]),
      exercise_id: z.string().describe("The library exercise's exact id, or an empty string for a free block."),
      text: z.string().describe("A free block's line; empty when the block is a library exercise."),
      minutes: z.number().int().describe("How long the block gets, at least 1."),
    }),
  ).describe("The session in order; the minutes should add up to the session's length."),
  reasoning: z.string().describe("One line for the teacher on what the draft reacts to."),
  homework: z.string().describe("One homework suggestion that fits the homework rule."),
});

export type PrepDraft = { blocks: BlockInputType[]; reasoning: string; homework: string };
export type PrepDraftResult = { ok: true; draft: PrepDraft } | { ok: false; error: string };

/** Pure: the model's blocks as the table takes them, or the first problem. */
export function blocksFromOutput(out: z.infer<typeof DraftOutput>, library: readonly { id: string }[]): { ok: true; blocks: BlockInputType[] } | { ok: false; error: string } {
  const blocks: BlockInputType[] = [];
  for (const b of out.blocks) {
    const parsed = BlockInput.safeParse({ side: b.side, exerciseId: b.exercise_id || null, text: b.exercise_id ? null : b.text || null, minutes: b.minutes });
    if (!parsed.success) return { ok: false, error: "The draft had a block that was neither an exercise nor a line." };
    blocks.push(parsed.data);
  }
  const unknown = unknownExercises(blocks, library);
  if (unknown.length) return { ok: false, error: `The draft named an exercise not in the library (${unknown[0]}).` };
  if (blocks.length === 0) return { ok: false, error: "The draft had no blocks." };
  return { ok: true, blocks };
}

type Inputs = { philosophy: string; library: string; history: string; recap: string; notes: string };

type PastRow = { id: string; starts_at: string; recap: unknown; recap_state: string; blocks: { position: number; side: string; exercise_id: string | null; text: string | null; minutes: number }[] };
type NoteRow = { person_id: string; strong: string; weak: string; focus: string; created_at: string; person: NamedPerson | null };

/** What the drafter reads: the plan's brief, the last three plans, the last published recap, the latest note per learner. */
async function gatherInputs(session: SessionView): Promise<Inputs> {
  const titleOf = new Map(session.library.map((e) => [e.id, e.title]));
  const library = session.library.map((e) => `${e.id} · ${e.side} · ${e.title} · ${e.minutesMin}–${e.minutesMax} min · ${e.skills.join(", ") || "no tags"} · ${(e.instructions ?? "").slice(0, 300)}`).join("\n") || "(empty)";

  let philosophy = "(not written yet)";
  let history = "(none)";
  let recap = "(none)";
  let notes = "(none)";
  if (session.planId) {
    const plans = mustRows(await companyOs.from("training_plans").select("philosophy").eq("id", session.planId).limit(1), "[training] plan brief") as { philosophy: unknown }[];
    const p = Philosophy.safeParse(plans[0]?.philosophy);
    if (p.success) {
      const d = p.data;
      philosophy = [
        `Purpose: ${d.purpose}`,
        `Presentation half (${d.halves.split}% of the minutes): ${d.halves.presentation}`,
        `Reactive half (${100 - d.halves.split}%): ${d.halves.reactive}`,
        `Pressure: ${d.pressure_rule}`,
        `Group sessions are for: ${d.group_for}`,
        `One-on-one sessions are for: ${d.one_on_one_for}`,
        `Homework: ${d.homework_rule}`,
        `What good looks like: ${d.good_looks_like.map((l) => `${l.line} (${l.side})`).join("; ")}`,
      ].join("\n");
    }
    const past = mustRows(
      await companyOs
        .from("trainings")
        .select("id, starts_at, recap, recap_state, blocks:training_session_blocks(position, side, exercise_id, text, minutes)")
        .eq("plan_id", session.planId)
        .is("cancelled_at", null)
        .lt("starts_at", session.startsAt)
        .order("starts_at", { ascending: false })
        .limit(3),
      "[training] past sessions",
    ) as unknown as PastRow[];
    const plansText = past
      .filter((s) => s.blocks.length)
      .map((s) => `${businessDate(s.starts_at)}: ${[...s.blocks].sort((a, b) => a.position - b.position).map((b) => `${b.side} ${b.minutes} min: ${b.exercise_id ? (titleOf.get(b.exercise_id) ?? "an exercise") : b.text}`).join("; ")}`);
    if (plansText.length) history = plansText.join("\n");
    const published = past.find((s) => s.recap_state === "published" && s.recap && typeof s.recap === "object");
    if (published) {
      const r = published.recap as { covered?: string; learners?: { person_id: string; md: string }[] };
      const names = new Map(session.people.map((p) => [p.id, p.name]));
      recap = [r.covered ?? "", ...(r.learners ?? []).map((l) => `${names.get(l.person_id) ?? "A learner"}: ${l.md}`)].filter(Boolean).join("\n") || "(none)";
    }
    const noteRows = mustRows(
      await companyOs
        .from("training_learner_notes")
        .select(`person_id, strong, weak, focus, created_at, person:people!training_learner_notes_person_id_fkey(${NAME_COLUMNS})`)
        .eq("plan_id", session.planId)
        .in("person_id", session.people.map((p) => p.id))
        .order("created_at", { ascending: false })
        .limit(200),
      "[training] learner notes",
    ) as unknown as NoteRow[];
    const latest = new Map<string, NoteRow>();
    for (const n of noteRows) if (!latest.has(n.person_id)) latest.set(n.person_id, n);
    if (latest.size) notes = [...latest.values()].map((n) => `${n.person ? personName(n.person) : "A learner"}: strong: ${n.strong}; weak: ${n.weak}; focus now: ${n.focus}`).join("\n");
  }
  return { philosophy, library, history, recap, notes };
}

/** One model call for one session; returns the draft and writes nothing. Never throws. */
export async function draftSessionPlan(session: SessionView): Promise<PrepDraftResult> {
  const ai = aiSite({ site: PREP_DRAFT_SITE, dataClass: PREP_DRAFT_CLASS, tier: "standard" });
  const client = ai.clientIfConfigured();
  if (!client) return { ok: false, error: "ANTHROPIC_API_KEY is not configured." };
  const inputs = await gatherInputs(session);
  try {
    const response = await client.messages.create({
      prompt: PREP_DRAFT_PROMPT,
      model: ai.model,
      max_tokens: 4000,
      system: PREP_DRAFT_PROMPT.system,
      output_config: { effort: "medium", format: { type: "json_schema", schema: jsonSchemaFor(DraftOutput) } },
      messages: [
        {
          role: "user",
          content: fillPrompt(PREP_DRAFT_PROMPT.user, {
            title: session.title,
            when: whenLabel(session.startsAt, session.endsAt),
            minutes: String(minutesBetween(session.startsAt, session.endsAt)),
            learners: session.people.map((p) => p.name).join(", ") || "nobody yet",
            ...inputs,
          }),
        },
      ],
    });
    const out = readStructuredOutput(PREP_DRAFT_SITE, ai.model, response, DraftOutput, "The model declined this session.");
    if (!out.ok) return out;
    const blocks = blocksFromOutput(out.data, session.library);
    if (!blocks.ok) return blocks;
    return { ok: true, draft: { blocks: blocks.blocks, reasoning: out.data.reasoning.trim(), homework: out.data.homework.trim() } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Drafts and saves one session's plan as drafted, for the routine and the Redraft button. */
export async function draftAndSave(organiserId: string, trainingId: string, now: Date): Promise<{ ok: true; homework: string } | { ok: false; error: string }> {
  const session = await readSessionPlan(organiserId, trainingId, now);
  if (!session) return { ok: false, error: "That session was not found." };
  const drafted = await draftSessionPlan(session);
  if (!drafted.ok) return drafted;
  // The homework suggestion travels with the reasoning until the organiser sets it as an assignment (PR 4).
  const reasoning = drafted.draft.homework ? `${drafted.draft.reasoning}\n\nHomework suggestion: ${drafted.draft.homework}` : drafted.draft.reasoning;
  const saved = await saveBlocks(organiserId, trainingId, drafted.draft.blocks, "draft", reasoning, now);
  if (!saved.ok) return saved;
  return { ok: true, homework: drafted.draft.homework };
}
