import { addDays, dateMs, saigonToday } from "@/kernel/config/dates";
import { companyOs } from "@/kernel/data/supabase";

// Shared lead-funnel counts, read by both the SDR leads queue
// (/admin/revenue/leads) and the Marketing overview funnel row
// (/admin/revenue/marketing). Living in one place is the point: the two pages
// print the same "meetings booked this week" number, so they can never drift.

// The weekly target for Sales meetings, prospect and client calls alike.
export const WEEKLY_MEETINGS_GOAL = 2;

// Monday 00:00 in Saigon, the start of the goal week. The server runs in UTC,
// so a local-time Monday would start the week at 07:00 Saigon.
function startOfWeekIso(): string {
  const today = saigonToday();
  const monday = addDays(today, -((new Date(dateMs(today)).getUTCDay() + 6) % 7));
  return new Date(`${monday}T00:00:00+07:00`).toISOString();
}

// Meetings booked since Monday: the numerator of the weekly goal. A meeting is a
// Sales meeting in company_os.meetings, where every booked call lands however it
// was filed (the Lark scheduler, a pasted recording, a manual entry). The SDR
// hand-off's "meeting_booked" transition was the old source, and calls booked
// outside the leads queue never wrote one, so the tile read 0 for months.
export async function getMeetingsBookedThisWeek(): Promise<number> {
  const { count, error: bookedErr } = await companyOs.from("meetings").select("id", { count: "exact", head: true })
    .eq("meeting_type", "Sales")
    .gte("started_at", startOfWeekIso());
  if (bookedErr) console.error("[company-os/crm] meetings", bookedErr);
  return count ?? 0;
}

// Leads that entered the SDR satellite within the window (null = all time). One
// lead row is created per person worked, so this is top-of-funnel volume for the
// range regardless of where each lead sits now.
export async function getNewLeadsCount(sinceIso: string | null): Promise<number> {
  let query = companyOs.from("lead").select("id", { count: "exact", head: true });
  if (sinceIso) query = query.gte("created_at", sinceIso);
  const { count, error: leadsErr } = await query;
  if (leadsErr) console.error("[company-os/crm] lead", leadsErr);
  return count ?? 0;
}
