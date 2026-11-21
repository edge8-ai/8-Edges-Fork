// The programme read (TR.7) as the pages ask for it: the register and the
// reviews of every training in the viewer's scope, turned into slices by
// programme-read-rules.ts. What a page receives carries no person: each slice
// is figures or a reason, and a note is its words plus, for a signed note whose
// author is still on the team, the name (leavers.ts). Reads raise on failure
// (rule 2): a failed read must not render as a programme nobody reviewed.
import { companyOs } from "@/kernel/data/supabase";
import { mustPages, mustRows } from "@/kernel/data/read";
import { listTypes } from "./trainings";
import { typeTone } from "./training-format";
import { noteAuthors, noteSignature } from "./leavers";
import { planHidden } from "./learner-visibility";
import { FEELINGS, LOADS, SKIP_REASONS, type Feeling, type Load, type SkipReason } from "./training-rules";
import { inScope, programmeRead, type Fact, type Figures, type HiddenReason, type ProgrammeViewer, type ReadFilter, type Slice } from "./programme-read-rules";

/** A note as a page shows it: the words, and a name only when the writer signed it and is still on the team. */
export type ShownNote = { text: string; by: string | null };

/** A slice as a page shows it; `tone` is a type's colour class (training-format), null for a plan. */
export type ViewSlice = { key: string; grain: "type" | "plan"; id: string; name: string; sub: string; tone: string | null } & (
  | { shown: true; figures: Figures; notes: ShownNote[] }
  | { shown: false; reason: HiddenReason; beside: string | null }
);

export type ProgrammeView =
  | { refused: true }
  | { refused: false; slices: ViewSlice[]; totals: { reviews: number; stars: number; went: number; listed: number } | null };

type Row = {
  person_id: string;
  status: string;
  skip_reason: string | null;
  reviews: { stars: number; load: string | null; tags: string[]; note: string | null; signed: boolean }[] | null;
  training: { id: string; starts_at: string; organiser_id: string; self_logged: boolean; type_id: string; plan_id: string | null } | null;
};

const SELECT = `person_id, status, skip_reason, reviews:training_reviews!training_reviews_attended_only(stars, load, tags, note, signed), training:trainings!inner(id, starts_at, organiser_id, self_logged, type_id, plan_id, cancelled_at)`;

function toFact(r: Row): Fact | null {
  const t = r.training;
  if (!t) return null;
  const status = r.status === "attended" || r.status === "skipped" || r.status === "absent" ? r.status : "pending";
  const review = r.reviews?.[0];
  return {
    trainingId: t.id,
    startsAt: t.starts_at,
    typeId: t.type_id,
    planId: t.plan_id,
    personId: r.person_id,
    status,
    skipReason: r.skip_reason && (SKIP_REASONS as readonly string[]).includes(r.skip_reason) ? (r.skip_reason as SkipReason) : null,
    review: review
      ? {
          stars: review.stars,
          load: review.load && (LOADS as readonly string[]).includes(review.load) ? (review.load as Load) : null,
          tags: review.tags.filter((x): x is Feeling => (FEELINGS as readonly string[]).includes(x)),
          note: review.note,
          signed: review.signed,
        }
      : null,
  };
}

/** Every live register row of a training that has started and was not cancelled. */
async function readRows(now: Date): Promise<Row[]> {
  return mustPages<Row>("[training] programme read", (from, to) =>
    companyOs.from("training_attendance").select(SELECT).is("removed_at", null).is("training.cancelled_at", null).lt("training.starts_at", now.toISOString()).order("id").range(from, to),
  );
}

/** The plans a person is on and may see: not removed from, not archived, not closed to learners (learner-visibility). */
async function memberPlanIds(personId: string): Promise<Set<string>> {
  if (personId === "") return new Set();
  const rows = mustRows(
    await companyOs.from("training_plan_members").select("plan_id, plan:training_plans!inner(open_to_learners, archived_at)").eq("person_id", personId).is("removed_at", null).is("plan.archived_at", null),
    "[training] programme member plans",
  ) as unknown as { plan_id: string; plan: { open_to_learners: boolean } | null }[];
  return new Set(rows.filter((r) => r.plan && !planHidden(r.plan)).map((r) => r.plan_id));
}

async function planTitles(ids: readonly string[]): Promise<{ id: string; title: string }[]> {
  if (ids.length === 0) return [];
  return mustRows(await companyOs.from("training_plans").select("id, title").in("id", [...ids]), "[training] programme plans") as { id: string; title: string }[];
}

/** The slices for a page, with notes resolved and every person left out. */
async function toView(facts: Fact[], filter: ReadFilter, now: Date): Promise<ProgrammeView> {
  const planIds = [...new Set(facts.flatMap((f) => (f.planId ? [f.planId] : [])))];
  const types = await listTypes({ withRetired: true });
  const plans = await planTitles(planIds);
  const read = programmeRead({ facts, types, plans, now }, filter);
  if (read.refused) return read;
  const signers = read.slices.flatMap((s) => (s.shown ? s.notes.filter((n) => n.signed).map((n) => n.personId) : []));
  const authors = await noteAuthors(signers);
  const rankOf = new Map(types.map((t) => [t.id, t.rank]));
  const slices = read.slices.map((s: Slice): ViewSlice => {
    const base = { key: `${s.grain}:${s.id}`, grain: s.grain, id: s.id, name: s.name, sub: s.sub, tone: s.grain === "type" ? typeTone(rankOf.get(s.id) ?? 0) : null };
    if (!s.shown) return { ...base, shown: false, reason: s.reason, beside: s.beside };
    return {
      ...base,
      shown: true,
      figures: s.figures,
      notes: s.notes.map((n) => ({ text: n.text, by: noteSignature({ note: n.text, signed: n.signed }, authors.get(n.personId)) })),
    };
  });
  return { refused: false, slices, totals: read.totals };
}

/** Who is asking, as a page knows them: their person and their access. The loader adds the plans they are on. */
export type ProgrammeAsker = Omit<ProgrammeViewer, "planIds">;

/** The read of every training in the asker's scope, for My Team › Training and Talent › People › Training. */
export async function programmeView(asker: ProgrammeAsker, filter: ReadFilter, now: Date): Promise<ProgrammeView> {
  const [only] = await programmeViewsOf([asker], [filter], now);
  return only.view;
}

/**
 * Several askers' reads at several filters, from one read of the register: the
 * weekly narration (TR.9) reads the programme as every viewer sees it, and one
 * register read per viewer and period would be dozens of identical reads. Each
 * view is exactly what programmeView gives that asker, because it is the same
 * scope rule over the same rows.
 */
export async function programmeViewsOf(askers: readonly ProgrammeAsker[], filters: readonly ReadFilter[], now: Date): Promise<{ asker: ProgrammeAsker; filter: ReadFilter; view: ProgrammeView }[]> {
  const rows = await readRows(now);
  const people = new Map<string, string[]>();
  for (const r of rows) if (r.training) people.set(r.training.id, [...(people.get(r.training.id) ?? []), r.person_id]);
  const out: { asker: ProgrammeAsker; filter: ReadFilter; view: ProgrammeView }[] = [];
  for (const asker of askers) {
    const viewer: ProgrammeViewer = { ...asker, planIds: await memberPlanIds(asker.personId) };
    const facts = rows.flatMap((r) => {
      const t = r.training;
      if (!t || !inScope({ organiserId: t.organiser_id, selfLogged: t.self_logged, planId: t.plan_id }, people.get(t.id) ?? [], viewer)) return [];
      const f = toFact(r);
      return f ? [f] : [];
    });
    for (const filter of filters) out.push({ asker, filter, view: await toView(facts, filter, now) });
  }
  return out;
}

/**
 * How each plan the member is on is landing, for the plan card on My Training:
 * the plan's slice from the very read My Team › Training gives the same person,
 * so the two can never differ, and a plan too few reviewed comes back hidden
 * with its reason. `planIds` are the plans myPlans found the member on.
 */
export async function myPlanReads(asker: ProgrammeAsker, planIds: readonly string[], now: Date): Promise<Map<string, ViewSlice>> {
  if (planIds.length === 0) return new Map();
  const view = await programmeView(asker, { period: "start", typeId: null, planId: null }, now);
  const wanted = new Set(planIds);
  return new Map(view.refused ? [] : view.slices.filter((s) => s.grain === "plan" && wanted.has(s.id)).map((s) => [s.id, s]));
}

/** The Admin filter's choices: every type, retired ones too, and every plan not archived, by name. */
export async function programmeFilterOptions(): Promise<{ types: { value: string; label: string }[]; plans: { value: string; label: string }[] }> {
  const types = await listTypes({ withRetired: true });
  const plans = mustRows(await companyOs.from("training_plans").select("id, title").is("archived_at", null).order("title").limit(500), "[training] programme plan options") as { id: string; title: string }[];
  return { types: types.map((t) => ({ value: t.id, label: t.name })), plans: plans.map((p) => ({ value: p.id, label: p.title })) };
}
