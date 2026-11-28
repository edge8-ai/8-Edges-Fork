"use server";

import { requirePermission } from "@/kernel/identity/access-request";
import { zodIssuesToMessage } from "@/kernel/config/schemas";
import type { Result } from "@/kernel/data/result";
import { setCycleDueDate } from "@/entities/org/lib/client-reviews/cycle-due-date";
import { NO_PERSON, signedInPerson } from "@/entities/org/lib/client-reviews/acting-person";
import { DueDateInput } from "./due-date-schemas";

/** Sets or clears the cycle's due date from its overview (CR.5.7). It sends nothing; the reminder follows the date. */
export async function setDueDateAction(raw: DueDateInput): Promise<Result> {
  const access = await requirePermission("org.reviews");
  const input = DueDateInput.safeParse(raw);
  if (!input.success) return { ok: false, error: zodIssuesToMessage(input.error.issues) };
  const by = signedInPerson(access);
  if (!by) return NO_PERSON;
  return setCycleDueDate(input.data.cycleId, input.data.dueDate, by);
}
