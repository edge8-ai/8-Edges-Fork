// What a plan looks like on a page (TR.5, English Program PR 1): to its
// organiser, the roster and every session with where it stands; to a member,
// the plans they are on, the next session and the philosophy. Neither read
// carries anyone's answer: attendance is read only inside the programme read
// (ADR 0016). Reads raise on failure (rule 2).
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import { Rhythm, type RhythmType } from "./plan-rhythm";
import { Philosophy, type PhilosophyType } from "./philosophy";
import { organiserMay, trainingState, type OrganiserMay, type TrainingState } from "./training-rules";
import { PLAN_STATES, type PlanState } from "./session-plan-rules";
import { planHidden } from "./learner-visibility";

export type PlanSession = {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  state: TrainingState;
  may: OrganiserMay;
  peopleCount: number;
  planState: PlanState;
};

export type PlanView = {
  id: string;
  typeId: string;
  typeName: string;
  title: string;
  rhythm: RhythmType;
  publishedUntil: string | null;
  larkTitle: string | null;
  // Whether the plan's learners see it (learner-visibility); the organiser always does.
  openToLearners: boolean;
  philosophy: PhilosophyType | null;
  philosophyUpdatedAt: string | null;
  philosophyUpdatedBy: string | null;
  roster: { id: string; name: string }[];
  // Who receives the weekly recap (PR 9): the person and the address of theirs it goes to.
  recipients: { personId: string; email: string }[];
  recipientNames: string[];
  sessions: PlanSession[];
};

type PlanRow = {
  id: string;
  type_id: string;
  title: string;
  rhythm: unknown;
  published_until: string | null;
  lark_title: string | null;
  open_to_learners: boolean;
  recipients: unknown;
  philosophy: unknown;
  philosophy_updated_at: string | null;
  type: { name: string } | null;
  editor: NamedPerson | null;
  members: { person_id: string; removed_at: string | null; person: NamedPerson | null }[];
};

type SessionRow = {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  plan_state: string;
  attendance: { removed_at: string | null }[];
};

const PLAN_COLUMNS = `id, type_id, title, rhythm, published_until, lark_title, open_to_learners, recipients, philosophy, philosophy_updated_at, type:training_types(name), editor:people!training_plans_philosophy_updated_by_fkey(${NAME_COLUMNS}), members:training_plan_members(person_id, removed_at, person:people!training_plan_members_person_id_fkey(${NAME_COLUMNS}))`;

/** A stored philosophy, or null when none or not the shape the code knows. */
function readPhilosophy(raw: unknown): PhilosophyType | null {
  const parsed = Philosophy.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function recipientsOf(raw: unknown): { personId: string; email: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof (x as { person_id?: unknown }).person_id === "string" && typeof (x as { email?: unknown }).email === "string" ? [{ personId: (x as { person_id: string }).person_id, email: (x as { email: string }).email }] : []));
}

function planView(r: PlanRow, sessions: PlanSession[], recipientNames: string[] = []): PlanView {
  const recipients = recipientsOf(r.recipients);
  return {
    id: r.id,
    typeId: r.type_id,
    typeName: r.type?.name ?? "Training",
    title: r.title,
    rhythm: Rhythm.parse(r.rhythm),
    publishedUntil: r.published_until,
    larkTitle: r.lark_title,
    openToLearners: r.open_to_learners,
    philosophy: readPhilosophy(r.philosophy),
    philosophyUpdatedAt: r.philosophy_updated_at,
    philosophyUpdatedBy: r.editor ? personName(r.editor) : null,
    roster: r.members
      .filter((m) => m.removed_at === null)
      .map((m) => ({ id: m.person_id, name: m.person ? personName(m.person) : "Someone" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    recipients,
    recipientNames: recipientNames.length ? recipientNames : recipients.map((x) => x.email),
    sessions,
  };
}

/** The recipients' names, from the people their person_id names. */
async function namesOf(recipients: { personId: string; email: string }[]): Promise<string[]> {
  if (recipients.length === 0) return [];
  const rows = mustRows(await companyOs.from("people").select(`id, ${NAME_COLUMNS}`).in("id", recipients.map((r) => r.personId)), "[training] recipients") as unknown as (NamedPerson & { id: string })[];
  const byId = new Map(rows.map((p) => [p.id, personName(p)]));
  return recipients.map((r) => byId.get(r.personId) ?? r.email);
}

/** The plans this organiser runs, newest first, without their sessions. */
export async function organisedPlans(organiserId: string): Promise<PlanView[]> {
  const rows = mustRows(
    await companyOs.from("training_plans").select(PLAN_COLUMNS).eq("organiser_id", organiserId).is("archived_at", null).order("created_at", { ascending: false }).limit(100),
    "[training] plans",
  ) as unknown as PlanRow[];
  return rows.map((r) => planView(r, []));
}

/** One plan the organiser runs, with every session; null when it is not theirs. */
export async function readPlan(organiserId: string, planId: string, now: Date): Promise<PlanView | null> {
  const rows = mustRows(
    await companyOs.from("training_plans").select(PLAN_COLUMNS).eq("id", planId).eq("organiser_id", organiserId).is("archived_at", null).limit(1),
    "[training] plan",
  ) as unknown as PlanRow[];
  const plan = rows[0];
  if (!plan) return null;
  const sessions = mustRows(
    await companyOs.from("trainings").select("id, title, notes, starts_at, ends_at, cancelled_at, plan_state, attendance:training_attendance(removed_at)").eq("plan_id", planId).order("starts_at").limit(500),
    "[training] plan sessions",
  ) as unknown as SessionRow[];
  return planView(
    plan,
    sessions.map((s) => ({
      id: s.id,
      title: s.title,
      notes: s.notes,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      state: trainingState({ startsAt: s.starts_at, cancelledAt: s.cancelled_at }, now),
      may: organiserMay({ startsAt: s.starts_at, cancelledAt: s.cancelled_at }, now),
      peopleCount: s.attendance.filter((a) => a.removed_at === null).length,
      planState: (PLAN_STATES as readonly string[]).includes(s.plan_state) ? (s.plan_state as PlanState) : "none",
    })),
    await namesOf(recipientsOf(plan.recipients)),
  );
}

export type MyPlan = {
  id: string;
  title: string;
  typeName: string;
  rhythm: RhythmType;
  organiserName: string;
  philosophy: PhilosophyType | null;
  // The other people on it, so a learner knows who they are in it with.
  with: string[];
};

type MyPlanRow = {
  removed_at: string | null;
  plan: {
    id: string;
    title: string;
    rhythm: unknown;
    philosophy: unknown;
    archived_at: string | null;
    open_to_learners: boolean;
    type: { name: string } | null;
    organiser: NamedPerson | null;
    members: { person_id: string; removed_at: string | null; person: NamedPerson | null }[];
  } | null;
};

/** The plans the member is on and may see, for My Training: the brief and who else is in it, nothing about anyone's answers. */
export async function myPlans(personId: string): Promise<MyPlan[]> {
  const rows = mustRows(
    await companyOs
      .from("training_plan_members")
      .select(
        `removed_at, plan:training_plans!inner(id, title, rhythm, philosophy, archived_at, open_to_learners, type:training_types(name), organiser:people!training_plans_organiser_id_fkey(${NAME_COLUMNS}), members:training_plan_members(person_id, removed_at, person:people!training_plan_members_person_id_fkey(${NAME_COLUMNS})))`,
      )
      .eq("person_id", personId)
      .is("removed_at", null)
      .is("plan.archived_at", null)
      .limit(50),
    "[training] my plans",
  ) as unknown as MyPlanRow[];
  return rows.flatMap((r) => {
    const p = r.plan;
    if (!p || planHidden(p)) return [];
    const rhythm = Rhythm.safeParse(p.rhythm);
    if (!rhythm.success) return [];
    return [
      {
        id: p.id,
        title: p.title,
        typeName: p.type?.name ?? "Training",
        rhythm: rhythm.data,
        organiserName: p.organiser ? personName(p.organiser) : "an organiser",
        philosophy: readPhilosophy(p.philosophy),
        with: p.members
          .filter((m) => m.removed_at === null && m.person_id !== personId)
          .map((m) => (m.person ? personName(m.person) : "Someone"))
          .sort(),
      },
    ];
  });
}
