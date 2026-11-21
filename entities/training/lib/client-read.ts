// What a client reads of the training Edge8 runs for them, in their portal
// (ADR 0016, amended 2026-11-19). A plan shows to the company its organiser
// linked it to (training_plans.company_id), while it is live and open to its
// learners. The client reads the programme (title, rhythm, purpose, how it
// runs), the names on its roster, each session's date and, once published,
// its lesson summary (the recap's `covered`), and every weekly recap as it was
// sent to them by email.
//
// Never anything else. The columns below are an allow-list, and
// client-read.test.ts fails if this file starts to name a review, a teacher's
// note, instructor feedback, the English evaluation, a submission or an
// outcome, or a recap's own line to a learner. Every read is scoped by the
// company ids the portal actor may read, which the kernel computes from the
// session, never from input. Reads raise on failure (rule 2), except the
// sidebar's entitlement, which mutes the row instead.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { personName, NAME_COLUMNS, type NamedPerson } from "@/kernel/config/people-name";
import type { PortalActor } from "@/kernel/identity/portal-auth";
import { Rhythm, rhythmLabel } from "./plan-rhythm";
import { Philosophy } from "./philosophy";
import { Recap } from "./session-recap-rules";
import { WeeklyDraft } from "./weekly-recap-rules";

export type ClientPlanSummary = { id: string; title: string; rhythm: string; learners: number; held: number; summaries: number; nextAt: string | null };

export type ClientSession = { id: string; startsAt: string; endsAt: string; held: boolean; summary: string | null };

export type ClientWeeklyRecap = {
  weekStart: string;
  sentAt: string | null;
  thisWeek: string;
  attendance: string;
  progress: { name: string; md: string }[];
  nextWeek: string;
  instructorNote: string | null;
};

export type ClientPlan = {
  id: string;
  title: string;
  rhythm: string;
  purpose: string | null;
  halves: { presentation: string; reactive: string } | null;
  learners: string[];
  sessions: ClientSession[];
  recaps: ClientWeeklyRecap[];
};

type PlanRow = { id: string; title: string; rhythm: unknown; philosophy: unknown; members: { removed_at: string | null; person: (NamedPerson & { id: string }) | null }[] };
type SessionRow = { id: string; plan_id: string; starts_at: string; ends_at: string; recap_state: string; recap: unknown };
type RecapRow = { week_start: string; sent_at: string | null; draft: unknown; instructor_note: string | null };

const PLAN_COLUMNS = `id, title, rhythm, philosophy, members:training_plan_members(removed_at, person:people!training_plan_members_person_id_fkey(id, ${NAME_COLUMNS}))`;
const SESSION_COLUMNS = "id, plan_id, starts_at, ends_at, recap_state, recap";
const RECAP_COLUMNS = "week_start, sent_at, draft, instructor_note";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The live plans linked to any of these companies, open to their learners. */
function plansFor(companyIds: readonly string[], columns: string) {
  return companyOs.from("training_plans").select(columns).in("company_id", [...companyIds]).is("archived_at", null).eq("open_to_learners", true);
}

const rhythmOf = (raw: unknown): string => {
  const r = Rhythm.safeParse(raw);
  return r.success ? rhythmLabel(r.data) : "";
};

/** Pure: the lesson summary a client may read of a session, the published recap's `covered` and nothing else. */
export function clientSummary(s: { recap_state: string; recap: unknown }): string | null {
  if (s.recap_state !== "published") return null;
  const r = Recap.safeParse(s.recap);
  return r.success && r.data.covered.trim() ? r.data.covered : null;
}

/** Pure: a sent weekly recap as the client read it, progress lines named from the roster. */
export function clientRecap(r: RecapRow, names: ReadonlyMap<string, string>): ClientWeeklyRecap | null {
  const d = WeeklyDraft.safeParse(r.draft);
  if (!d.success) return null;
  return {
    weekStart: r.week_start,
    sentAt: r.sent_at,
    thisWeek: d.data.this_week,
    attendance: d.data.attendance,
    progress: d.data.progress.map((p) => ({ name: names.get(p.person_id) ?? "A learner", md: p.md })),
    nextWeek: d.data.next_week,
    instructorNote: r.instructor_note,
  };
}

/** The sidebar's Training row: lit when the client has a plan to read. A failed read mutes it rather than failing every portal page. */
export async function portalTrainingEntitlements(actor: PortalActor): Promise<Record<string, boolean>> {
  if (actor.companyScope.length === 0) return { training: false };
  const { data, error } = await plansFor(actor.companyScope, "id").limit(1);
  if (error) {
    console.error("[training] portal entitlement", error.message);
    return { training: false };
  }
  return { training: (data ?? []).length > 0 };
}

/** The client's plans, for /portal/training. */
export async function clientPlans(actor: PortalActor, now: Date): Promise<ClientPlanSummary[]> {
  if (actor.companyScope.length === 0) return [];
  const plans = mustRows(await plansFor(actor.companyScope, PLAN_COLUMNS).order("title").limit(50), "[training] client plans") as unknown as PlanRow[];
  if (plans.length === 0) return [];
  const sessions = mustRows(
    await companyOs.from("trainings").select(SESSION_COLUMNS).in("plan_id", plans.map((p) => p.id)).is("cancelled_at", null).order("starts_at").limit(2000),
    "[training] client sessions",
  ) as unknown as SessionRow[];
  const at = now.toISOString();
  return plans.map((p) => {
    const mine = sessions.filter((s) => s.plan_id === p.id);
    const held = mine.filter((s) => s.ends_at <= at);
    return {
      id: p.id,
      title: p.title,
      rhythm: rhythmOf(p.rhythm),
      learners: p.members.filter((m) => m.removed_at === null).length,
      held: held.length,
      summaries: held.filter((s) => clientSummary(s) !== null).length,
      nextAt: mine.find((s) => s.starts_at > at)?.starts_at ?? null,
    };
  });
}

/** One of the client's plans, or null when it is not theirs (or not live), so a guessed id tells them nothing. */
export async function clientPlan(actor: PortalActor, planId: string, now: Date): Promise<ClientPlan | null> {
  if (actor.companyScope.length === 0 || !UUID.test(planId)) return null;
  const rows = mustRows(await plansFor(actor.companyScope, PLAN_COLUMNS).eq("id", planId).limit(1), "[training] client plan") as unknown as PlanRow[];
  const p = rows[0];
  if (!p) return null;
  const [sessions, recaps] = await Promise.all([
    companyOs.from("trainings").select(SESSION_COLUMNS).eq("plan_id", p.id).is("cancelled_at", null).order("starts_at", { ascending: false }).limit(500),
    companyOs.from("training_weekly_recaps").select(RECAP_COLUMNS).eq("plan_id", p.id).eq("step", "sent").order("week_start", { ascending: false }).limit(200),
  ]);
  const sessionRows = mustRows(sessions, "[training] client plan sessions") as unknown as SessionRow[];
  const recapRows = mustRows(recaps, "[training] client plan recaps") as unknown as RecapRow[];
  const live = p.members.filter((m) => m.removed_at === null && m.person);
  const names = new Map(p.members.flatMap((m) => (m.person ? [[m.person.id, String(personName(m.person))] as const] : [])));
  const phil = Philosophy.safeParse(p.philosophy);
  const at = now.toISOString();
  return {
    id: p.id,
    title: p.title,
    rhythm: rhythmOf(p.rhythm),
    purpose: phil.success ? phil.data.purpose : null,
    halves: phil.success ? { presentation: phil.data.halves.presentation, reactive: phil.data.halves.reactive } : null,
    learners: live.map((m) => String(personName(m.person!))).sort((a, b) => a.localeCompare(b)),
    sessions: sessionRows.map((s) => ({ id: s.id, startsAt: s.starts_at, endsAt: s.ends_at, held: s.ends_at <= at, summary: clientSummary(s) })),
    recaps: recapRows.flatMap((r) => clientRecap(r, names) ?? []),
  };
}
