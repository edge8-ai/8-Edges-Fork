// The plan sessions on one Vietnam calendar day (English Program PR 3), for
// the two morning routines: which sessions to draft for tomorrow, which to
// remind about today. Pure in its window arithmetic; the read raises on
// failure (rule 2), because a failed read would mean nobody is reminded.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { PLAN_STATES, type PlanState } from "./session-plan-rules";

export type DaySession = { id: string; title: string; startsAt: string; endsAt: string; organiserId: string; planId: string; planState: PlanState };

// Vietnam keeps +07:00 all year, so a calendar day is a fixed UTC window.
export function dayWindow(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00+07:00`);
  return { from: from.toISOString(), to: new Date(from.getTime() + 24 * 60 * 60_000).toISOString() };
}

type Row = { id: string; title: string; starts_at: string; ends_at: string; organiser_id: string; plan_id: string; plan_state: string };

/** Every live session on a plan that starts on the given Vietnam day, earliest first. */
export async function sessionsOnDay(date: string): Promise<DaySession[]> {
  const { from, to } = dayWindow(date);
  const rows = mustRows(
    await companyOs
      .from("trainings")
      .select("id, title, starts_at, ends_at, organiser_id, plan_id, plan_state")
      .not("plan_id", "is", null)
      .is("cancelled_at", null)
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at")
      .limit(200),
    "[training] sessions on day",
  ) as unknown as Row[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    organiserId: r.organiser_id,
    planId: r.plan_id,
    planState: (PLAN_STATES as readonly string[]).includes(r.plan_state) ? (r.plan_state as PlanState) : "none",
  }));
}
