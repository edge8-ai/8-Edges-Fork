// Where a client stands against its start and end dates. Dates are calendar
// days ("2026-09-16"), compared as strings against today in the company time
// zone (GMT+7), so a relationship ending today still reads as active today.

// The term rule itself lives in the kernel, because the client lists in other
// entities decide "current" and "former" by it too.
import { clientTerm, type ClientTerm } from "@/kernel/identity/client-status";
export { clientTerm, type ClientTerm };

export function todayInCompanyZone(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

export function clientTermLabel(term: ClientTerm): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  switch (term.state) {
    case "unset":
      return "No dates set";
    case "upcoming":
      return `Starts in ${plural(term.daysUntilStart, "day")}`;
    case "active":
      return term.daysLeft === null ? "Active, no end date" : `Active, ${plural(term.daysLeft, "day")} left`;
    case "ended":
      return `Ended ${plural(term.daysSinceEnd, "day")} ago`;
  }
}
