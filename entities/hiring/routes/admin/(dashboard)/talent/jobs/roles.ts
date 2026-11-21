import type { BadgeTone } from "@/kernel/ui/Badge";
import { formatCents, humanize } from "@/kernel/ui/format";
import type { JobReqRow } from "./JobReqsTable";
import type { RoleCandidate } from "./OpenRoleCards";

// How the jobs page reads a job and its candidates, in one place the server
// page and the client cards both import. It carries no "use client", so the
// page head can ask whether a job is filled without crossing into a client
// module (a function imported from one arrives on the server as a reference
// it cannot call).

/** A pay band in words. A client sends its maximum only, which reads "Up to". */
export function salaryBand(min: number | null, max: number | null, cur: string): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${formatCents(min, cur)} – ${formatCents(max, cur)}`;
  return max != null ? `Up to ${formatCents(max, cur)}` : `From ${formatCents(min, cur)}`;
}

// Every seat is filled when the Hired count the card shows reaches the seats it
// says it fills. A job that does not say how many it hires never qualifies.
export function seatsFilled(r: JobReqRow): boolean {
  return r.headcount != null && r.headcount > 0 && (r.stageCounts.Hired ?? 0) >= r.headcount;
}

const OUT_STATUSES = new Set(["rejected", "withdrawn"]);

/**
 * Where a candidate stands, as the one badge their row carries. Production has
 * applications whose status and stage disagree (status active at stage
 * Rejected, status hired at stage Rejected), so the status wins when it is a
 * decision and the stage speaks otherwise.
 */
export function standing(c: RoleCandidate): { label: string; tone: BadgeTone; out: boolean } {
  const status = (c.status ?? "active").toLowerCase();
  if (status === "hired") return { label: "Hired", tone: "ok", out: false };
  if (OUT_STATUSES.has(status)) return { label: humanize(status), tone: "neutral", out: true };
  if (c.stageName === "Rejected") return { label: "Rejected", tone: "neutral", out: true };
  if (c.stageName === "Hired") return { label: "Hired", tone: "ok", out: false };
  if (status !== "active") return { label: humanize(status), tone: "warn", out: false };
  return { label: c.stageName ?? "New", tone: "info", out: false };
}

// Furthest along first, so the hire heads the list and the people out of the
// running sink to the bottom.
const STAGE_RANK: Record<string, number> = { Hired: 0, Offer: 1, Interview: 2, Screen: 3 };

function rank(c: RoleCandidate): number {
  const s = standing(c);
  if (s.out) return 9;
  if (s.label === "Hired") return 0;
  return STAGE_RANK[c.stageName ?? ""] ?? 5;
}

/** Candidates in stage order, best AI screen first within a stage. */
export function sortCandidates(list: RoleCandidate[]): RoleCandidate[] {
  return [...list].sort((a, b) => rank(a) - rank(b) || (b.aiRating ?? -1) - (a.aiRating ?? -1));
}

/** The people hired into the job, as a sentence ("A and B"); archived applications are left out. */
export function hiredNames(r: JobReqRow): string | null {
  const names = r.candidates
    .filter((c) => !c.archived && standing(c).label === "Hired" && c.name)
    .map((c) => c.name as string);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The card's line once every seat is hired: who was hired, and what is still left to do. */
export function filledLine(r: JobReqRow): string {
  const names = hiredNames(r);
  const lead = names ? `${names} ${names.includes(" and ") ? "were" : "was"} hired, so this job is filled.` : "Every seat is hired, so this job is filled.";
  return `${lead} ${r.isPublic ? "Its ad is still on the careers page." : "It is still open."}`;
}

/** The page head's second line: what waits on HR among the open jobs, or null when nothing does. */
export function openJobsSub(open: JobReqRow[]): string | null {
  if (open.length === 0) return "Nothing waits on you here. New job starts the next one.";
  const ready = open.filter(seatsFilled);
  if (ready.length === 0) return null;
  if (open.length === 1) {
    return (open[0].headcount ?? 1) > 1 ? "Its seats are filled, so it is ready to close." : "Its seat is filled, so it is ready to close.";
  }
  return `${ready.length} of them ${ready.length === 1 ? "is" : "are"} filled and ready to close.`;
}

// A job closed with no hire is "No hire" on the page, so it is not read as a
// fourth way to close beside Filled and Cancelled.
const PAST_LABEL: Record<string, string> = { closed: "No hire" };

export function pastStatusLabel(status: string): string {
  return PAST_LABEL[status] ?? humanize(status);
}
