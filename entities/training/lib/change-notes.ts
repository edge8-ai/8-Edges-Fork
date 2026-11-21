// Change notes (TR.8, spec stories 36 and 47): the organiser of a plan tells
// its learners what they changed because of the reviews. Only the plan's own
// organiser posts or removes one; removing hides it from the learners and
// keeps the row; a note is never edited. Learners read them on their plan
// card while the plan is open to them, which myPlans already decides
// (learner-visibility), so the reader here takes plans already found open.
// Reads raise on failure (rule 2): a failed read must not look like a plan
// whose organiser said nothing.
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_ONLY_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import type { Result } from "@/kernel/data/result";

/** The most a note may say, the table's own check. */
export const NOTE_MAX = 600;

export const NoteInput = z.object({
  body: z.string().trim().min(1, "Say what you changed.").max(NOTE_MAX, `Keep it to ${NOTE_MAX} characters.`),
});
export type NoteInputType = z.infer<typeof NoteInput>;

/** A note as a page shows it: the words, who posted it, and when. */
export type ChangeNote = { id: string; body: string; postedAt: string; postedBy: string };

type Row = { id: string; plan_id: string; body: string; posted_at: string; poster: NamedPerson | null };

const COLUMNS = `id, plan_id, body, posted_at, poster:people!training_change_notes_posted_by_fkey(${NAME_ONLY_COLUMNS})`;

function view(r: Row): ChangeNote {
  return { id: r.id, body: r.body, postedAt: r.posted_at, postedBy: r.poster ? personName(r.poster) : "The organiser" };
}

/** The shown notes of these plans, newest first, by plan. The caller passes only plans the reader may see. */
export async function notesForPlans(planIds: readonly string[]): Promise<Map<string, ChangeNote[]>> {
  const out = new Map<string, ChangeNote[]>();
  if (planIds.length === 0) return out;
  const rows = mustRows(
    await companyOs.from("training_change_notes").select(COLUMNS).in("plan_id", [...planIds]).is("removed_at", null).order("posted_at", { ascending: false }).limit(500),
    "[training] change notes",
  ) as unknown as Row[];
  for (const r of rows) out.set(r.plan_id, [...(out.get(r.plan_id) ?? []), view(r)]);
  return out;
}

/** Whether the plan is this organiser's own and not retired. */
async function organises(organiserId: string, planId: string): Promise<boolean> {
  const rows = mustRows(
    await companyOs.from("training_plans").select("id").eq("id", planId).eq("organiser_id", organiserId).is("archived_at", null).limit(1),
    "[training] change note plan",
  ) as { id: string }[];
  return rows.length === 1;
}

/** Posts a note on the organiser's own plan; returns its id for the audit. */
export async function postNote(organiserId: string, planId: string, input: NoteInputType): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await organises(organiserId, planId))) return { ok: false, error: "That plan is not one you run." };
  const { data, error } = await companyOs.from("training_change_notes").insert({ plan_id: planId, body: input.body, posted_by: organiserId }).select("id").single();
  if (error || !data) return { ok: false, error: "The note could not be posted. Try again." };
  return { ok: true, id: data.id };
}

/** Hides a note from the learners, keeping the row. Only a shown note on the organiser's own plan. */
export async function removeNote(organiserId: string, planId: string, noteId: string): Promise<Result> {
  if (!(await organises(organiserId, planId))) return { ok: false, error: "That plan is not one you run." };
  const { data, error } = await companyOs
    .from("training_change_notes")
    .update({ removed_at: new Date().toISOString(), removed_by: organiserId })
    .eq("id", noteId)
    .eq("plan_id", planId)
    .is("removed_at", null)
    .select("id");
  if (error) return { ok: false, error: "The note could not be removed. Try again." };
  if (!data || data.length === 0) return { ok: false, error: "That note is already gone." };
  return { ok: true };
}
