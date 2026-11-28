import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { activeMembersAtCompanies } from "@/entities/contacts";

// What the daily review scheduler does about client reviews (CR.1.4), kept
// here so the scheduler stays about the company's own reviews: a member placed
// at a client that has held a client review cycle in the last twelve months
// gets none of the company's own reviews: no probation, mid-year or renewal.
// They work inside the client's team, so a company review asks the wrong people
// about the wrong work; a team lead among them was handed their teammates'
// company reviews as manager of record (widened from mid-year only, 2026-11-21).
//
// A member's own reminder is no longer three days after opening: since CR.5.5
// it goes three working days before the cycle's due date, from the client
// review emails routine (./member-email-scheduler). A client manager or a
// skip-manager is never reminded by the app.

const YEAR_DAYS = 365;

/**
 * The team members actively placed at a client whose review cycle opened in
 * the twelve months up to today. A failed read raises: an empty set would
 * read as "nobody", and the scheduler would open company reviews for
 * everyone it should have skipped.
 */
export async function membersInRecentClientCycles(todayISO: string): Promise<Set<string>> {
  const since = addDays(todayISO, -YEAR_DAYS);
  const cycles = mustRows(
    await companyOs.from("review_cycles").select("company_id").not("company_id", "is", null).gte("opened_at", since),
    "[org/client-reviews] recent cycles",
  );
  const companyIds = [...new Set(cycles.map((c) => c.company_id).filter((id): id is string => id !== null))];
  if (companyIds.length === 0) return new Set();
  const placed = mustRows(await activeMembersAtCompanies(companyIds), "[org/client-reviews] members placed at those clients");
  return new Set(placed.map((p) => p.team_member_id));
}
