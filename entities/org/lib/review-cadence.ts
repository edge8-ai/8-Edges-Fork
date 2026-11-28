import { addDays, nextWorkday } from "@/kernel/config/dates";

// When the review scheduler chases an open part (review-scheduler.ts). Kept
// apart from the scheduler so the rule can be tested without its reads.

/** Weekly reminder cadence and the point we stop nagging. */
const REMINDER_EVERY_DAYS = 7;
const REMINDER_MAX_DAYS = 42;

/**
 * Whether a part opened on `createdISO` is due its weekly reminder today. Each
 * seventh day up to the ceiling is a reminder day, and one that lands on a
 * Saturday or a Sunday moves to the Monday after it: the scheduler runs on
 * weekdays only, inside the working window (CLAUDE.md, "Working hours"). Until
 * 2026-11-16 the test was `age % 7 === 0`, so a part opened at the weekend was
 * only ever due at the weekend, and a weekday-only run would never chase it.
 * One date matches each reminder day, so a part is still reminded once a week.
 */
export function weeklyReminderDue(createdISO: string, todayISO: string): boolean {
  for (let day = REMINDER_EVERY_DAYS; day <= REMINDER_MAX_DAYS; day += REMINDER_EVERY_DAYS) {
    if (nextWorkday(addDays(createdISO, day)) === todayISO) return true;
  }
  return false;
}
