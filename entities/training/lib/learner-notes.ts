// The teacher's living note about one learner on one plan (English Program
// PR 4): strong points, weak points, what to work on now. Append-only: every
// save is a new row and the latest wins, so the history is never lost. The
// learner reads it on My Training; it appears in no programme read, admin page,
// weekly recap or assistant tool (ADR 0016, amended 2026-10-12). Only the
// plan's organiser writes it.
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";

const Part = z.string().trim().max(2000, "Keep each part under 2,000 characters.");
export const NoteInput = z.object({ strong: Part, weak: Part, focus: Part });
export type NoteInputType = z.infer<typeof NoteInput>;

export type LearnerNote = { strong: string; weak: string; focus: string; writtenAt: string; versions: number };

type Row = { person_id: string; strong: string; weak: string; focus: string; created_at: string };

/** The latest note per learner on a plan, with how many versions sit behind it. */
export async function latestNotes(planId: string, personIds: readonly string[]): Promise<Map<string, LearnerNote>> {
  if (personIds.length === 0) return new Map();
  const rows = mustRows(
    await companyOs.from("training_learner_notes").select("person_id, strong, weak, focus, created_at").eq("plan_id", planId).in("person_id", [...personIds]).order("created_at", { ascending: false }).limit(500),
    "[training] learner notes",
  ) as Row[];
  const out = new Map<string, LearnerNote>();
  for (const r of rows) {
    const cur = out.get(r.person_id);
    if (cur) cur.versions += 1;
    else out.set(r.person_id, { strong: r.strong, weak: r.weak, focus: r.focus, writtenAt: r.created_at, versions: 1 });
  }
  return out;
}

async function organisesPlan(organiserId: string, planId: string): Promise<boolean> {
  const rows = mustRows(await companyOs.from("training_plans").select("id").eq("id", planId).eq("organiser_id", organiserId).is("archived_at", null).limit(1), "[training] own plan");
  return rows.length === 1;
}

/** A new version of the note, by the plan's organiser only. */
export async function writeNote(organiserId: string, planId: string, personId: string, input: NoteInputType): Promise<Result> {
  if (!(await organisesPlan(organiserId, planId))) return { ok: false, error: "That plan was not found." };
  const { error } = await companyOs.from("training_learner_notes").insert({ plan_id: planId, person_id: personId, ...input, written_by: organiserId });
  if (error) return { ok: false, error: "Could not save the note. Try again." };
  return { ok: true };
}

/** Appends a line to the learner's focus: a recap line the organiser folds into the note (PR 7). */
export async function appendToNote(organiserId: string, planId: string, personId: string, line: string): Promise<Result> {
  const latest = (await latestNotes(planId, [personId])).get(personId);
  const focus = latest?.focus ? `${latest.focus}\n${line}` : line;
  return writeNote(organiserId, planId, personId, { strong: latest?.strong ?? "", weak: latest?.weak ?? "", focus });
}

export type MyNote = { planId: string; planTitle: string; teacherName: string; note: LearnerNote };

type MyRow = { plan_id: string; strong: string; weak: string; focus: string; created_at: string; plan: { title: string; archived_at: string | null; organiser: NamedPerson | null } | null };

/** The latest note per live plan, for the learner's own My Training. */
export async function myNotes(personId: string): Promise<MyNote[]> {
  const rows = mustRows(
    await companyOs
      .from("training_learner_notes")
      .select(`plan_id, strong, weak, focus, created_at, plan:training_plans!inner(title, archived_at, organiser:people!training_plans_organiser_id_fkey(${NAME_COLUMNS}))`)
      .eq("person_id", personId)
      .is("plan.archived_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    "[training] my notes",
  ) as unknown as MyRow[];
  const out = new Map<string, MyNote>();
  for (const r of rows) {
    const cur = out.get(r.plan_id);
    if (cur) cur.note.versions += 1;
    else if (r.plan) {
      out.set(r.plan_id, {
        planId: r.plan_id,
        planTitle: r.plan.title,
        teacherName: r.plan.organiser ? personName(r.plan.organiser) : "your teacher",
        note: { strong: r.strong, weak: r.weak, focus: r.focus, writtenAt: r.created_at, versions: 1 },
      });
    }
  }
  return [...out.values()];
}
