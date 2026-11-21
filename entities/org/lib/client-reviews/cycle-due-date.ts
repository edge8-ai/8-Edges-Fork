import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { isUuid } from "@/kernel/config/slug";
import { recordAudit } from "@/kernel/audit/audit";
import { isCalendarDay, isPastDueDate, PAST_DUE_DATE_MESSAGE } from "./due-date";

// Changing a cycle's due date from its overview (CR.5.7). The due date drives
// the members' reminder (CR.5.5), which goes once, three working days before
// it, to members who have not sent theirs.
//
// Any change of the date clears the reminder's sent mark in the same write.
// Clearing it must, since the table refuses a sent mark with no due date
// (review_cycles_member_reminder_needs_due_date). Moving it to another day
// does too, so the new date gets its own reminder (Khoa, 2026-11-17).
// Setting the date it already has changes nothing, so saving the form twice
// never sends a second reminder for the same date.

type Actor = { personId: string; email: string };

const CLOSED_OR_GONE = "This cycle is closed, or was not found. Reload the page.";

/** Sets the due date, or clears it with null. A closed cycle keeps its date. */
export async function setCycleDueDate(cycleId: string, dueDate: string | null, by: Actor): Promise<Result> {
  if (!isUuid(cycleId)) return { ok: false, error: "That cycle was not found." };
  if (dueDate !== null && !isCalendarDay(dueDate)) return { ok: false, error: "Choose a real due date, or no due date." };
  if (dueDate !== null && isPastDueDate(dueDate)) return { ok: false, error: PAST_DUE_DATE_MESSAGE };
  const cycle = mustRows(
    await companyOs.from("review_cycles").select("due_date").eq("id", cycleId).is("closed_at", null).limit(1),
    "[org/client-reviews] review_cycles",
  )[0] as { due_date: string | null } | undefined;
  if (!cycle) return { ok: false, error: CLOSED_OR_GONE };
  if (cycle.due_date === dueDate) return { ok: true };
  // Written only over the date that was read, so a move made in another tab
  // in between is not undone, and its reminder mark is not cleared on old facts.
  const write = companyOs.from("review_cycles").update({ due_date: dueDate, member_reminder_sent_at: null }).eq("id", cycleId).is("closed_at", null);
  const overRead = cycle.due_date === null ? write.is("due_date", null) : write.eq("due_date", cycle.due_date);
  const { data, error } = await overRead.select("id");
  if (error) return { ok: false, error: "The due date could not be saved." };
  if (!data?.length) return { ok: false, error: "The due date changed just now, or the cycle closed. Reload the page." };
  await recordAudit({
    table: "review_cycles",
    recordId: cycleId,
    operation: "update",
    actor: by.email,
    context: { action: "client_review.due_date_set", dueDate, byPersonId: by.personId },
  });
  return { ok: true };
}
