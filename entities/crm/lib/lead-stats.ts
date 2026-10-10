import { companyOs } from "@/kernel/data/supabase";

// Shared lead-funnel counts, read by both the SDR leads queue
// (/admin/revenue/leads) and the Marketing overview funnel row
// (/admin/revenue/marketing). Living in one place is the point: the two pages
// print the same "meetings booked this week" number, so they can never drift.

// The SDR's weekly target for meetings handed to the closer.
export const WEEKLY_MEETINGS_GOAL = 8;

// Monday 00:00 local, the start of the goal week.
function startOfWeekIso(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.toISOString();
}

// Meetings booked since Monday: the numerator of the weekly goal. A meeting is a
// lifecycle transition with reason "meeting_booked", the same event the leads
// queue counts.
export async function getMeetingsBookedThisWeek(): Promise<number> {
  const { count, error: bookedErr } = await companyOs.from("lifecycle_transitions").select("id", { count: "exact", head: true })
    .eq("reason", "meeting_booked")
    .gte("occurred_at", startOfWeekIso());
  if (bookedErr) console.error("[company-os/crm] lifecycle_transitions", bookedErr);
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
