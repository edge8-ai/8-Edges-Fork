import type { CompanyOsUpdate } from "@/kernel/data/supabase";

// What HR may set a job's status and dates to from its drawer, in one place
// the server action and the drawer both read. It carries no "use client" and
// no server import, so the drawer can check a date before sending it and the
// action checks it again when it arrives.

/** The job_requisitions status CHECK constraint, in the order the picker lists them. */
export const JOB_STATUSES = ["draft", "open", "on_hold", "filled", "closed", "cancelled"] as const;

/** A job that is over. Each carries a Closed date; the others carry none. */
export const CLOSED_STATUSES: ReadonlySet<string> = new Set(["filled", "closed", "cancelled"]);

export type JobNow = { status: string; openedAt: string | null; closedAt: string | null };

export type StatusMove =
  | { ok: true; updates: CompanyOsUpdate<"job_requisitions">; endsChain: boolean; note: string | null }
  | { ok: false; error: string };

/**
 * The write a status change makes. It keeps the same rules as Close job and
 * Reopen, so the picker is not a way around them:
 *
 * - A closed status stamps Closed with `now` when the job has no Closed date
 *   yet, and ends the hiring chain when the job was not already over.
 * - Leaving a closed status clears Closed, as Reopen does.
 * - Opening takes the approver's yes while the hiring chain is live: a draft
 *   cannot be set to Open here, and a job that was over goes back to Draft.
 *   On hold resumes straight to Open, because only an open job can be put on
 *   hold, so a held job was approved already.
 */
export function statusMove(job: JobNow, next: string, opts: { opensDirectly: boolean; now: string }): StatusMove {
  if (!(JOB_STATUSES as readonly string[]).includes(next)) return { ok: false, error: "Unknown status." };
  if (next === job.status) return { ok: true, updates: {}, endsChain: false, note: null };
  const wasOver = CLOSED_STATUSES.has(job.status);

  if (CLOSED_STATUSES.has(next)) {
    return {
      ok: true,
      updates: { status: next, closed_at: job.closedAt ?? opts.now },
      endsChain: !wasOver,
      note: job.closedAt ? null : "Closed is set to today. Change it if the job ended earlier.",
    };
  }

  const cleared = wasOver ? "The job is no longer closed, so its Closed date is cleared." : null;

  if (next === "on_hold") {
    if (job.status !== "open") return { ok: false, error: "Only an open job can be put on hold." };
    return { ok: true, updates: { status: "on_hold" }, endsChain: false, note: null };
  }

  if (next === "draft") {
    return {
      ok: true,
      updates: { status: "draft", closed_at: null, ...(wasOver ? { chain_step: null } : {}) },
      endsChain: false,
      note: cleared,
    };
  }

  // next === "open"
  if (job.status === "on_hold" || opts.opensDirectly) {
    return {
      ok: true,
      updates: { status: "open", closed_at: null, opened_at: job.openedAt ?? opts.now, ...(wasOver ? { chain_step: null } : {}) },
      endsChain: false,
      note: cleared,
    };
  }
  if (job.status === "draft") return { ok: false, error: "A draft job opens when its approver says yes." };
  return {
    ok: true,
    updates: { status: "draft", closed_at: null, chain_step: null },
    endsChain: false,
    note: "The job is back in Draft and opens when its approver says yes. Its Closed date is cleared.",
  };
}

/**
 * Why a job's Opened and Closed dates (YYYY-MM-DD, business days) cannot be
 * saved, or null. `today` is the business day in Saigon.
 */
export function jobDatesError(d: { opened: string | null; closed: string | null; status: string; today: string }): string | null {
  for (const [label, day] of [["Opened", d.opened], ["Closed", d.closed]] as const) {
    if (day == null) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return `${label} is not a date.`;
    if (day > d.today) return `${label} can't be after today.`;
  }
  if (d.closed && !CLOSED_STATUSES.has(d.status)) return "Only a filled, no-hire or cancelled job has a Closed date.";
  if (d.opened && d.closed && d.closed < d.opened) return "Closed can't be before Opened.";
  return null;
}
