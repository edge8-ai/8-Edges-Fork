// Outcomes on My Training (TR.6, the canvas approved 2026-11-02): what a person
// achieved, in their own words, and which trainings and plans they think
// helped. The record is the person's own. They write it, or accept a
// suggestion from an organiser or from a certification they earned, and only
// they read it (ADR 0016): an organiser who suggests one never learns whether
// it was added. A dismissed suggestion is kept, so the same certificate is
// never offered twice (Khoa, 2026-11-02).
//
// The tables' keys already refuse a credit for a training or plan the person
// was never on. They cannot see removed_at or the answer, so every write here
// checks the credits against the person's live rows first (db-review on #2467).
import { z } from "zod";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { businessDate, saigonToday } from "@/kernel/config/dates";
import { PLAN_FLAG, hiddenFromLearners, planHidden, type FlaggedTraining } from "./learner-visibility";

const Id = z.string().uuid();
const Credit = z.discriminatedUnion("kind", [z.object({ kind: z.literal("training"), id: Id }), z.object({ kind: z.literal("plan"), id: Id })]);
export type CreditRef = z.infer<typeof Credit>;

export const OutcomeInput = z.object({
  happenedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the day it happened."),
  description: z.string().trim().min(1, "Say what happened.").max(500, "Keep it under 500 characters."),
  credits: z.array(Credit).max(30, "Credit at most 30 trainings and plans."),
});
export type OutcomeInputType = z.infer<typeof OutcomeInput>;

export const SuggestInput = z.object({
  happenedOn: OutcomeInput.shape.happenedOn,
  description: OutcomeInput.shape.description,
  creditThis: z.boolean(),
});
export type SuggestInputType = z.infer<typeof SuggestInput>;

type OutcomeSource = "member" | "organiser" | "certification";

export type Outcome = {
  id: string;
  happenedOn: string;
  description: string;
  source: OutcomeSource;
  // The organiser's name on a suggestion of theirs; null otherwise.
  suggestedBy: string | null;
  certificationTrack: string | null;
  credits: CreditRef[];
};

/** A day can be today or earlier, never later: an outcome is something that happened. */
function notAhead(happenedOn: string): string | null {
  return happenedOn > saigonToday() ? "An outcome is something that already happened. Pick today or an earlier day." : null;
}

type OutcomeRow = {
  id: string;
  happened_on: string;
  description: string;
  source: OutcomeSource;
  status: "suggested" | "accepted" | "dismissed";
  certification_track: string | null;
  suggester: NamedPerson | null;
};
type CreditRow = { outcome_id: string; training_id: string | null; plan_id: string | null };

/** The person's own outcomes and the suggestions waiting for their word, newest first. */
export async function myOutcomes(personId: string): Promise<{ accepted: Outcome[]; waiting: Outcome[] }> {
  const rows = mustRows(
    await companyOs
      .from("training_outcomes")
      .select(`id, happened_on, description, source, status, certification_track, suggester:people!training_outcomes_suggested_by_fkey(${NAME_COLUMNS})`)
      .eq("person_id", personId)
      .in("status", ["accepted", "suggested"])
      .order("happened_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    "[training] my outcomes",
  ) as unknown as OutcomeRow[];
  const credits = rows.length
    ? (mustRows(
        await companyOs.from("training_outcome_credits").select("outcome_id, training_id, plan_id").eq("person_id", personId).in("outcome_id", rows.map((r) => r.id)).limit(3000),
        "[training] my outcome credits",
      ) as CreditRow[])
    : [];
  // A credit on a plan since closed to its learners, or on one of that plan's
  // sessions, is not handed back: the plan tells them nothing, its ids
  // included (boundary review on #2469).
  const planIds = [...new Set(credits.flatMap((c) => (c.plan_id ? [c.plan_id] : [])))];
  const trainingIds = [...new Set(credits.flatMap((c) => (c.training_id ? [c.training_id] : [])))];
  const plans = planIds.length ? (mustRows(await companyOs.from("training_plans").select("id, open_to_learners").in("id", planIds), "[training] credited plans") as { id: string; open_to_learners: boolean }[]) : [];
  const trainings = trainingIds.length ? (mustRows(await companyOs.from("trainings").select(`id, plan_id, ${PLAN_FLAG}`).in("id", trainingIds), "[training] credited trainings") as unknown as (FlaggedTraining & { id: string })[]) : [];
  const hidden = new Set([...plans.filter((p) => planHidden(p)).map((p) => `plan:${p.id}`), ...trainings.filter(hiddenFromLearners).map((t) => `training:${t.id}`)]);
  const byOutcome = new Map<string, CreditRef[]>();
  for (const c of credits) {
    if ((c.plan_id && hidden.has(`plan:${c.plan_id}`)) || (c.training_id && hidden.has(`training:${c.training_id}`))) continue;
    const ref: CreditRef | null = c.training_id ? { kind: "training", id: c.training_id } : c.plan_id ? { kind: "plan", id: c.plan_id } : null;
    if (ref) byOutcome.set(c.outcome_id, [...(byOutcome.get(c.outcome_id) ?? []), ref]);
  }
  const view = (r: OutcomeRow): Outcome => ({
    id: r.id,
    happenedOn: r.happened_on,
    description: r.description,
    source: r.source,
    suggestedBy: r.suggester ? personName(r.suggester) : null,
    certificationTrack: r.certification_track,
    credits: byOutcome.get(r.id) ?? [],
  });
  return { accepted: rows.filter((r) => r.status === "accepted").map(view), waiting: rows.filter((r) => r.status === "suggested").map(view) };
}

/**
 * The credits the person may give: trainings they went to, and plans they are
 * on and may see. A row taken away (removed_at), a training they said they
 * skipped, a session or plan closed to its learners, or an archived plan is
 * refused, as My Training hides each of them. Returns the refusal,
 * or null when every credit is theirs to give.
 */
async function refuseCredits(personId: string, credits: CreditRef[]): Promise<string | null> {
  const trainingIds = [...new Set(credits.filter((c) => c.kind === "training").map((c) => c.id))];
  const planIds = [...new Set(credits.filter((c) => c.kind === "plan").map((c) => c.id))];
  if (trainingIds.length) {
    const went = mustRows(
      await companyOs.from("training_attendance").select(`training_id, training:trainings!inner(plan_id, ${PLAN_FLAG})`).eq("person_id", personId).in("training_id", trainingIds).eq("status", "attended").is("removed_at", null),
      "[training] creditable trainings",
    ) as unknown as { training_id: string; training: FlaggedTraining | null }[];
    // A session on a plan closed to its learners is hidden from My Training, so it cannot be credited either.
    if (went.filter((r) => r.training && !hiddenFromLearners(r.training)).length !== trainingIds.length) return "You can credit only trainings you went to.";
  }
  if (planIds.length) {
    const on = mustRows(
      await companyOs.from("training_plan_members").select("plan_id, plan:training_plans!inner(open_to_learners, archived_at)").eq("person_id", personId).in("plan_id", planIds).is("removed_at", null).is("plan.archived_at", null),
      "[training] creditable plans",
    ) as unknown as { plan_id: string; plan: { open_to_learners: boolean; archived_at: string | null } | null }[];
    if (on.filter((r) => !planHidden(r.plan)).length !== planIds.length) return "You can credit only plans you are on.";
  }
  return null;
}

/** Replaces an outcome's credits with the given set. The outcome is already known to be the person's. */
async function setCredits(personId: string, outcomeId: string, credits: CreditRef[]): Promise<Result> {
  const { error: clearError } = await companyOs.from("training_outcome_credits").delete().eq("outcome_id", outcomeId).eq("person_id", personId);
  if (clearError) return { ok: false, error: "Could not save what helped. Try again." };
  if (credits.length === 0) return { ok: true };
  const seen = new Set<string>();
  const rows = credits
    .filter((c) => !seen.has(`${c.kind}:${c.id}`) && seen.add(`${c.kind}:${c.id}`))
    .map((c) => ({ outcome_id: outcomeId, person_id: personId, training_id: c.kind === "training" ? c.id : null, plan_id: c.kind === "plan" ? c.id : null }));
  const { error } = await companyOs.from("training_outcome_credits").insert(rows);
  if (error) return { ok: false, error: "Could not save what helped. Try again." };
  return { ok: true };
}

/** "+ Record an outcome": the person's own, on their record at once. */
export async function recordOutcome(personId: string, input: OutcomeInputType): Promise<Result> {
  const refused = notAhead(input.happenedOn) ?? (await refuseCredits(personId, input.credits));
  if (refused) return { ok: false, error: refused };
  const { data, error } = await companyOs
    .from("training_outcomes")
    .insert({ person_id: personId, happened_on: input.happenedOn, description: input.description, source: "member", status: "accepted" })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not record it. Try again." };
  const credited = await setCredits(personId, data.id, input.credits);
  if (!credited.ok) {
    // Half an outcome is worse than none: the person would see it without
    // what they said helped, and think it was saved.
    await companyOs.from("training_outcomes").delete().eq("id", data.id).eq("person_id", personId);
    return credited;
  }
  return { ok: true };
}

/** Edit: the person's accepted outcome, its words, its day and what helped. */
export async function editOutcome(personId: string, outcomeId: string, input: OutcomeInputType): Promise<Result> {
  const refused = notAhead(input.happenedOn) ?? (await refuseCredits(personId, input.credits));
  if (refused) return { ok: false, error: refused };
  const { data, error } = await companyOs
    .from("training_outcomes")
    .update({ happened_on: input.happenedOn, description: input.description })
    .eq("id", outcomeId)
    .eq("person_id", personId)
    .eq("status", "accepted")
    .select("id");
  if (error) return { ok: false, error: "Could not save it. Try again." };
  if (!data?.length) return { ok: false, error: "That outcome was not found." };
  return setCredits(personId, outcomeId, input.credits);
}

/** Remove: the person's accepted outcome goes for good, its credits with it. */
export async function removeOutcome(personId: string, outcomeId: string): Promise<Result> {
  const { data, error } = await companyOs.from("training_outcomes").delete().eq("id", outcomeId).eq("person_id", personId).eq("status", "accepted").select("id");
  if (error) return { ok: false, error: "Could not remove it. Try again." };
  if (!data?.length) return { ok: false, error: "That outcome was not found." };
  return { ok: true };
}

/** "Add to my record", straight or after "Edit first": the suggestion becomes the person's, in the words they leave it in. */
export async function acceptSuggestion(personId: string, outcomeId: string, input: OutcomeInputType): Promise<Result> {
  const refused = notAhead(input.happenedOn) ?? (await refuseCredits(personId, input.credits));
  if (refused) return { ok: false, error: refused };
  const { data, error } = await companyOs
    .from("training_outcomes")
    .update({ status: "accepted", answered_at: new Date().toISOString(), happened_on: input.happenedOn, description: input.description })
    .eq("id", outcomeId)
    .eq("person_id", personId)
    .eq("status", "suggested")
    .select("id");
  if (error) return { ok: false, error: "Could not add it. Try again." };
  if (!data?.length) return { ok: false, error: "That suggestion was already answered." };
  return setCredits(personId, outcomeId, input.credits);
}

/** "Dismiss": kept as dismissed, so it is never offered again, and counted nowhere. */
export async function dismissSuggestion(personId: string, outcomeId: string): Promise<Result> {
  const { data, error } = await companyOs
    .from("training_outcomes")
    .update({ status: "dismissed", answered_at: new Date().toISOString() })
    .eq("id", outcomeId)
    .eq("person_id", personId)
    .eq("status", "suggested")
    .select("id");
  if (error) return { ok: false, error: "Could not dismiss it. Try again." };
  if (!data?.length) return { ok: false, error: "That suggestion was already answered." };
  return { ok: true };
}

/**
 * An organiser suggests an outcome for someone on a training they organise.
 * It waits on that person's My Training; the organiser is told nothing more,
 * whatever the person does with it.
 */
export async function suggestOutcome(organiserId: string, trainingId: string, personId: string, input: SuggestInputType): Promise<Result> {
  if (personId === organiserId) return { ok: false, error: "Record your own outcomes on My Training." };
  const ahead = notAhead(input.happenedOn);
  if (ahead) return { ok: false, error: ahead };
  const own = mustRows(
    await companyOs.from("trainings").select("id, starts_at, plan:training_plans(open_to_learners)").eq("id", trainingId).eq("organiser_id", organiserId).is("cancelled_at", null).limit(1),
    "[training] suggest: own training",
  ) as unknown as { id: string; starts_at: string; plan: { open_to_learners: boolean } | null }[];
  if (own.length !== 1) return { ok: false, error: "That training was not found." };
  // An outcome comes from a session that happened; the page offers it only then.
  if (new Date(own[0].starts_at).getTime() > Date.now()) return { ok: false, error: "Suggest an outcome once the session has started." };
  // A plan closed to its learners tells them nothing, a suggestion included.
  if (planHidden(own[0].plan)) return { ok: false, error: "This plan is closed to its learners. Open it to them before suggesting an outcome." };
  const on = mustRows(
    await companyOs.from("training_attendance").select("status").eq("training_id", trainingId).eq("person_id", personId).is("removed_at", null).limit(1),
    "[training] suggest: on the training",
  ) as { status: string }[];
  if (on.length !== 1) return { ok: false, error: "That person is not on this training." };
  const { data, error } = await companyOs
    .from("training_outcomes")
    .insert({ person_id: personId, happened_on: input.happenedOn, description: input.description, source: "organiser", status: "suggested", suggested_by: organiserId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Could not suggest it. Try again." };
  // Only a training they went to can be credited; for one they skipped, the
  // suggestion still goes, with nothing credited.
  if (input.creditThis && on[0].status === "attended") {
    const { error: creditError } = await companyOs.from("training_outcome_credits").insert({ outcome_id: data.id, person_id: personId, training_id: trainingId, plan_id: null });
    if (creditError) {
      await companyOs.from("training_outcomes").delete().eq("id", data.id).eq("person_id", personId);
      return { ok: false, error: "Could not suggest it. Try again." };
    }
  }
  return { ok: true };
}

export type CertificationOffer = { personId: string; track: string; label: string; awardedAt: string };

/**
 * A certificate the provider awarded becomes a suggestion on the person's My
 * Training, once per track and never again: the unique key on (person,
 * track) makes a second offer a no-op, and a dismissed one stays dismissed.
 * Called by the nightly certification sync with every award it read.
 */
export async function offerCertifications(offers: CertificationOffer[]): Promise<Result> {
  if (offers.length === 0) return { ok: true };
  const { error } = await companyOs.from("training_outcomes").upsert(
    offers.map((o) => ({
      person_id: o.personId,
      happened_on: businessDate(o.awardedAt),
      description: `Earned the ${o.label} certificate`,
      source: "certification",
      status: "suggested",
      certification_track: o.track,
    })),
    { onConflict: "person_id,certification_track", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: `outcome offers: ${error.message}` };
  return { ok: true };
}
