import { z } from "zod";
import { isCalendarDay, isPastDueDate, PAST_DUE_DATE_MESSAGE } from "@/entities/org/lib/client-reviews/due-date";
import { CycleInput } from "./schemas";

// The input of the overview's due-date field (CR.5.7), parsed right after the
// action's guard. Null clears the date. The past-date words are the open
// form's, so a date refused here reads as it does when the cycle is opened.

export const DueDateInput = CycleInput.extend({
  dueDate: z
    .string()
    .refine(isCalendarDay, "Choose a real due date, or no due date.")
    .refine((d) => !isPastDueDate(d), PAST_DUE_DATE_MESSAGE)
    .nullable(),
});
export type DueDateInput = z.infer<typeof DueDateInput>;
