import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { addDays, diffDays } from "@/kernel/config/dates";
import { activeMembersAtCompanies } from "@/entities/contacts";

// What the nightly review scheduler does about client reviews (CR.1.4). Two
// rules, kept here so the scheduler stays about the company's own reviews:
//
// 1. A member placed at a client that has held a client review cycle in the
//    last twelve months gets no mid-year review from the company. The client
//    review covers the same months, and two reviews of one half-year is one
//    too many (spec, "Telling people"). Probation and renewal reviews are the
//    company's employment decisions and still open.
// 2. A member who has not submitted their part three days after the cycle
//    opened is reminded once, by email. A client manager or a skip-manager is
//    never reminded by the app: the person running the cycle chases them from
//    her own email.

/** How long a member has before the one reminder. */
export const CLIENT_REMINDER_AFTER_DAYS = 3;

const YEAR_DAYS = 365;

/**
 * The team members actively placed at a client whose review cycle opened in
 * the twelve months up to today. A failed read raises: an empty set would
 * read as "nobody", and the scheduler would open a mid-year review for
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

type PendingPart = { team_member_id: string; rater_kind: string; created_at: string };

/**
 * The members to remind today: each whose own client review part has waited
 * exactly the reminder's days. Exactly, so a nightly run reminds once and a
 * missed night is not made up with a second email. Only a member's own part
 * counts; every other kind of part belongs to someone the app never mails.
 */
export function membersToRemind(pendingClientParts: readonly PendingPart[], todayISO: string): string[] {
  return [
    ...new Set(
      pendingClientParts
        .filter((p) => p.rater_kind === "self" && diffDays(p.created_at.slice(0, 10), todayISO) === CLIENT_REMINDER_AFTER_DAYS)
        .map((p) => p.team_member_id),
    ),
  ];
}
