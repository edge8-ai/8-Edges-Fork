// Training plans (TR.5, English Program PR 1): a series an organiser runs on a
// rhythm, published as trainings up to a date of their choosing. Every write
// takes the organiser and filters on them, so an organiser changes only the
// plans they run. Nothing but the organiser extends a plan: publishing is the
// only thing that creates its trainings, and no routine calls it.
//
// A plan's sessions are ordinary trainings with plan_id set, so moving or
// cancelling one alone is updateTraining and cancelTraining from ./trainings,
// and adding one by hand is scheduleTraining on the plan.
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { BLANK_WORD } from "./attendance-word";
import { saigonToday } from "@/kernel/config/dates";
import { Rhythm, occurrencesFor, type RhythmType } from "./plan-rhythm";
import { scheduleTraining } from "./trainings";
import { ScheduleInput } from "./training-rules";

const Uuid = z.string().uuid("That was not found.");
const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

export const PlanInput = z.object({
  typeId: Uuid,
  title: z.string().trim().min(1, "Give the plan a title.").max(200, "Keep the title under 200 characters."),
  rhythm: Rhythm,
  larkTitle: z.string().trim().max(200, "Keep the Lark title under 200 characters.").optional(),
});
export type PlanInputType = z.infer<typeof PlanInput>;

export const PublishInput = z.object({ until: Date_ });
export const RosterInput = z.object({ personIds: z.array(Uuid).max(200) });
/** A session added by hand: the plan's type and title, so only the time is asked. */
export const AddSessionInput = ScheduleInput.pick({ date: true, start: true, minutes: true, notes: true });
export type AddSessionInputType = z.infer<typeof AddSessionInput>;

type PlanRow = {
  id: string;
  type_id: string;
  title: string;
  rhythm: RhythmType;
  published_until: string | null;
  members: { person_id: string; removed_at: string | null }[];
};

async function ownPlan(organiserId: string, planId: string): Promise<PlanRow | null> {
  const rows = mustRows(
    await companyOs
      .from("training_plans")
      .select("id, type_id, title, rhythm, published_until, members:training_plan_members(person_id, removed_at)")
      .eq("id", planId)
      .eq("organiser_id", organiserId)
      .is("archived_at", null)
      .limit(1),
    "[training] own plan",
  ) as unknown as PlanRow[];
  return rows[0] ?? null;
}

const liveMembers = (p: PlanRow) => p.members.filter((m) => m.removed_at === null).map((m) => m.person_id);

export async function createPlan(organiserId: string, input: PlanInputType): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("training_plans")
    .insert({ type_id: input.typeId, title: input.title, organiser_id: organiserId, rhythm: input.rhythm, lark_title: input.larkTitle || null })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not create the plan. Try again." };
  return { ok: true, id: data.id };
}

/** Changes the plan itself. Trainings already published keep their time; the new rhythm applies from the next publish. */
export async function updatePlan(organiserId: string, planId: string, input: PlanInputType): Promise<Result> {
  if (!(await ownPlan(organiserId, planId))) return { ok: false, error: "That plan was not found." };
  const { error } = await companyOs
    .from("training_plans")
    .update({ type_id: input.typeId, title: input.title, rhythm: input.rhythm, lark_title: input.larkTitle || null })
    .eq("id", planId)
    .eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not save the plan. Try again." };
  return { ok: true };
}

/**
 * Who is on the plan. Taking a person off marks their row removed and takes
 * them off every session that has not started; adding one puts them on those
 * sessions. A session that has started keeps who was on it.
 */
export async function setRoster(organiserId: string, planId: string, personIds: readonly string[], now: Date): Promise<Result> {
  const plan = await ownPlan(organiserId, planId);
  if (!plan) return { ok: false, error: "That plan was not found." };
  const want = new Set(personIds);
  const live = new Set(liveMembers(plan));
  const known = new Set(plan.members.map((m) => m.person_id));
  const takeOff = [...live].filter((p) => !want.has(p));
  const putBack = [...want].filter((p) => known.has(p) && !live.has(p));
  const add = [...want].filter((p) => !known.has(p));
  const failed = { ok: false as const, error: "Could not change the roster. Try again." };
  const at = now.toISOString();

  if (takeOff.length) {
    const { error } = await companyOs.from("training_plan_members").update({ removed_at: at, removed_by: organiserId }).eq("plan_id", planId).in("person_id", takeOff);
    if (error) return failed;
  }
  if (putBack.length) {
    const { error } = await companyOs
      .from("training_plan_members")
      .update({ removed_at: null, removed_by: null, added_at: at, added_by: organiserId })
      .eq("plan_id", planId)
      .in("person_id", putBack);
    if (error) return failed;
  }
  if (add.length) {
    const { error } = await companyOs.from("training_plan_members").insert(add.map((p) => ({ plan_id: planId, person_id: p, added_by: organiserId })));
    if (error) return failed;
  }

  // The sessions still to come follow the roster.
  const upcoming = mustRows(
    await companyOs.from("trainings").select("id, attendance:training_attendance(person_id, removed_at)").eq("plan_id", planId).is("cancelled_at", null).gt("starts_at", at),
    "[training] plan sessions",
  ) as unknown as { id: string; attendance: { person_id: string; removed_at: string | null }[] }[];
  for (const t of upcoming) {
    const on = new Set(t.attendance.filter((a) => a.removed_at === null).map((a) => a.person_id));
    const ever = new Set(t.attendance.map((a) => a.person_id));
    const off = [...on].filter((p) => !want.has(p));
    const back = [...want].filter((p) => ever.has(p) && !on.has(p));
    const fresh = [...want].filter((p) => !ever.has(p));
    if (off.length) {
      const { error } = await companyOs.from("training_attendance").update({ removed_at: at, removed_by: organiserId }).eq("training_id", t.id).in("person_id", off);
      if (error) return failed;
    }
    if (back.length) {
      // A person put back starts with no word, the source included (A.40).
      const { error } = await companyOs
        .from("training_attendance")
        .update({ removed_at: null, removed_by: null, ...BLANK_WORD })
        .eq("training_id", t.id)
        .in("person_id", back);
      if (error) return failed;
    }
    if (fresh.length) {
      const { error } = await companyOs.from("training_attendance").insert(fresh.map((p) => ({ training_id: t.id, person_id: p })));
      if (error) return failed;
    }
  }
  return { ok: true };
}

/**
 * Creates the plan's trainings up to `until`, from the day after the last
 * published date (or today), each with the roster on it, and moves
 * published_until forward. Only the organiser calls this, and only forward.
 */
export async function publishPlan(organiserId: string, planId: string, until: string, now: Date): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const plan = await ownPlan(organiserId, planId);
  if (!plan) return { ok: false, error: "That plan was not found." };
  const today = saigonToday();
  if (plan.published_until && until <= plan.published_until) return { ok: false, error: `Already published to ${plan.published_until}. Pick a later date.` };
  if (until < today) return { ok: false, error: "Pick a date from today on." };
  const from = plan.published_until && plan.published_until >= today ? nextDay(plan.published_until) : today;
  const roster = liveMembers(plan);
  const sessions = occurrencesFor(plan.rhythm, from, until).filter((o) => new Date(o.startsAt).getTime() > now.getTime());

  if (sessions.length) {
    const { data, error } = await companyOs
      .from("trainings")
      .insert(sessions.map((o) => ({ type_id: plan.type_id, title: plan.title, starts_at: o.startsAt, ends_at: o.endsAt, organiser_id: organiserId, self_logged: false, plan_id: planId })))
      .select("id");
    if (error || !data) return { ok: false, error: "Could not publish the plan. Try again." };
    if (roster.length) {
      const rows = data.flatMap((t) => roster.map((p) => ({ training_id: t.id, person_id: p })));
      const { error: aErr } = await companyOs.from("training_attendance").insert(rows);
      if (aErr) {
        // The trainings exist with nobody on them: cancel them so no half-made session shows anywhere.
        await companyOs.from("trainings").update({ cancelled_at: now.toISOString(), cancelled_by: organiserId }).in("id", data.map((t) => t.id));
        return { ok: false, error: "Could not publish the plan. Try again." };
      }
    }
  }
  const { error } = await companyOs.from("training_plans").update({ published_until: until }).eq("id", planId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "The sessions were created, but the plan's end date was not saved. Try again." };
  return { ok: true, created: sessions.length };
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** One session added by hand, group or private, with the roster on it; the pickup finds its recording like any other. */
export async function addSession(organiserId: string, planId: string, input: AddSessionInputType, now: Date): Promise<Result> {
  const plan = await ownPlan(organiserId, planId);
  if (!plan) return { ok: false, error: "That plan was not found." };
  const roster = liveMembers(plan);
  if (roster.length === 0) return { ok: false, error: "Put someone on the plan first." };
  const res = await scheduleTraining(organiserId, { ...input, typeId: plan.type_id, title: plan.title, personIds: roster }, now, planId);
  return res.ok ? { ok: true } : res;
}

/** Retires a plan: its trainings keep it, nothing new is published from it. */
export async function archivePlan(organiserId: string, planId: string, now: Date): Promise<Result> {
  if (!(await ownPlan(organiserId, planId))) return { ok: false, error: "That plan was not found." };
  const { error } = await companyOs
    .from("training_plans")
    .update({ archived_at: now.toISOString(), archived_by: organiserId })
    .eq("id", planId)
    .eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not retire the plan. Try again." };
  return { ok: true };
}

export const OpenInput = z.object({ open: z.boolean() });

/**
 * Opens the plan to its learners or closes it (learner-visibility): while it
 * is closed they see none of its sessions, homework, notes or recaps, and the
 * organiser and the routines carry on as before. Nothing is lost by closing.
 */
export async function setOpenToLearners(organiserId: string, planId: string, open: boolean): Promise<Result> {
  if (!(await ownPlan(organiserId, planId))) return { ok: false, error: "That plan was not found." };
  const { error } = await companyOs.from("training_plans").update({ open_to_learners: open }).eq("id", planId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not change who can see the plan. Try again." };
  return { ok: true };
}

export const RecipientsInput = z.object({ emails: z.array(z.string().trim().email("Give a full address.")).max(20) });

/**
 * Who receives the plan's weekly recap (PR 9): each address must belong to a
 * person in the directory, so the recipient is the person and the address is
 * theirs; an unknown address is refused rather than stored as a bare email.
 */
export async function setRecipients(organiserId: string, planId: string, emails: readonly string[]): Promise<Result> {
  if (!(await ownPlan(organiserId, planId))) return { ok: false, error: "That plan was not found." };
  const wanted = [...new Set(emails.map((e) => e.toLowerCase()))];
  const people = wanted.length
    ? (mustRows(await companyOs.from("people").select("id, email").in("email", wanted), "[training] recipients") as { id: string; email: string | null }[])
    : [];
  const byEmail = new Map(people.map((p) => [(p.email ?? "").toLowerCase(), p.id]));
  const unknown = wanted.find((e) => !byEmail.has(e));
  if (unknown) return { ok: false, error: `${unknown} is not in the directory. Add the person to the CRM first.` };
  const recipients = wanted.map((e) => ({ person_id: byEmail.get(e)!, email: e }));
  const { error } = await companyOs.from("training_plans").update({ recipients }).eq("id", planId).eq("organiser_id", organiserId);
  if (error) return { ok: false, error: "Could not save the recipients. Try again." };
  return { ok: true };
}
