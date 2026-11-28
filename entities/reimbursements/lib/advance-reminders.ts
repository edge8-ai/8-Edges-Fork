// The reminders an advance needs while money is out (AD.9, design section 8): one to its
// owner a few working days before the date, and one to its owner and Finance once it has
// passed. Overdue itself is read and never stored; what is stored is only that the notice
// went, claimed before the email so a rerun, or two runs at once, sends one.
//
// The claim comes first, so a failed email is a reminder lost and named in the run's
// failures, never one sent twice: a person nagged about money is worse than a run someone
// has to look at. An advance whose settlement is being checked gets neither. The person has
// done their part, and it is waiting on us.
import { holidayCalendar } from "@/entities/time-off";
import { mustRows } from "@/kernel/data/read";
import { tellOfOverdue, tellOwnerOfDeadline } from "./advance-notices";
import { isOverdue, isSettling, returnStillReported, type AdvanceStatus } from "./advance-rules";
import { selectReimbursementAdvances, selectReimbursementAdvanceTransfers, selectReimbursementClaims } from "./reads";
import { outstandingOf } from "./settlement-rules";
import { reminderOn, type HolidayDay } from "./working-days";
import { updateReimbursementAdvances } from "./writes";

type Held = { status: "paid_out" | "to_return"; id: string; refNo: number; personId: string; purpose: string; amountVnd: number; settleBy: string; remindedAt: string | null; overdueToldAt: string | null; claimStatus: string | null };

/** Money with a person: spent or not yet accounted for, or owed back. Both have a date to keep. */
const HELD: readonly AdvanceStatus[] = ["paid_out", "to_return"];

/** What each held advance is due today, if anything. Pure. The overdue notice comes first: past the date, a reminder of it is pointless. */
export function dueToday(a: Pick<Held, "settleBy" | "remindedAt" | "overdueToldAt" | "claimStatus"> & { status?: Held["status"] }, today: string, holidays: readonly HolidayDay[] | null): "overdue" | "reminder" | null {
  const status = a.status ?? "paid_out";
  // A settlement that closed owing has no date to keep: the close already asked for the money.
  if (status === "to_return" && a.claimStatus !== null) return null;
  if (isSettling({ status, claimStatus: a.claimStatus })) return null;
  if (isOverdue({ status, settleBy: a.settleBy, claimStatus: a.claimStatus }, today)) return a.overdueToldAt === null ? "overdue" : null;
  if (a.remindedAt !== null || holidays === null) return null;
  return today >= reminderOn(a.settleBy, holidays) ? "reminder" : null;
}

/** Claims one notice, on the advance still being held. Answers whether this run won it. */
async function claim(id: string, column: "reminded_at" | "overdue_told_at"): Promise<boolean> {
  const { data, error } = await updateReimbursementAdvances({ [column]: new Date().toISOString() })
    .eq("id", id)
    .in("status", [...HELD])
    .is(column, null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function sendAdvanceReminders(today: string): Promise<{ reminded: number; overdue: number; failed: string[] }> {
  const report = { reminded: 0, overdue: 0, failed: [] as string[] };
  const rows = mustRows(
    await selectReimbursementAdvances("id, status, ref_no, person_id, purpose, amount_vnd, settle_by, reminded_at, overdue_told_at, balance_vnd, metadata").in("status", [...HELD]).not("settle_by", "is", null),
    "[reimbursements] advances with money out",
  );
  if (rows.length === 0) return report;
  const claims = mustRows(await selectReimbursementClaims("advance_id, status").not("advance_id", "is", null), "[reimbursements] settlements of held advances");
  const claimStatus = new Map(claims.map((c) => [String(c.advance_id), String(c.status)]));
  const owing = rows.filter((r) => r.status === "to_return").map((r) => String(r.id));
  const returns = owing.length === 0 ? [] : mustRows(await selectReimbursementAdvanceTransfers("advance_id, amount_vnd").eq("direction", "in").in("advance_id", owing), "[reimbursements] money back on held advances");
  const returned = new Map<string, number>();
  for (const t of returns) returned.set(String(t.advance_id), (returned.get(String(t.advance_id)) ?? 0) + Number(t.amount_vnd));

  // A calendar that cannot answer costs today's reminders, which tomorrow's run still sends.
  // It costs no overdue notice: being past a date needs no calendar.
  const year = Number(today.slice(0, 4));
  let holidays: HolidayDay[] | null = null;
  try {
    holidays = await holidayCalendar(`${year}-01-01`, `${year + 1}-12-31`);
  } catch (err) {
    report.failed.push(`the holiday calendar: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const r of rows) {
    const held: Held = {
      status: r.status === "to_return" ? "to_return" : "paid_out",
      id: String(r.id),
      refNo: Number(r.ref_no),
      personId: String(r.person_id),
      purpose: String(r.purpose),
      amountVnd: Number(r.amount_vnd),
      settleBy: String(r.settle_by),
      remindedAt: (r.reminded_at as string | null) ?? null,
      overdueToldAt: (r.overdue_told_at as string | null) ?? null,
      claimStatus: claimStatus.get(String(r.id)) ?? null,
    };
    const returnedVnd = returned.get(held.id) ?? 0;
    const owedVnd = held.status === "to_return" ? outstandingOf(Number(r.balance_vnd), returnedVnd) : null;
    // Someone who said they sent it is waiting on the bank and on us, and nothing owed is a lost status write.
    if (owedVnd !== null && (owedVnd === 0 || returnStillReported(r.metadata, returnedVnd))) continue;
    const due = dueToday(held, today, holidays);
    if (!due) continue;
    const about = { advanceId: held.id, refNo: held.refNo, ownerPersonId: held.personId, purpose: held.purpose, amountVnd: held.amountVnd, eventId: owedVnd === null ? due : `${due}-back`, settleBy: held.settleBy };
    try {
      if (!(await claim(held.id, due === "overdue" ? "overdue_told_at" : "reminded_at"))) continue;
      if (due === "overdue") {
        if (await tellOfOverdue({ ...about, owedVnd })) report.overdue += 1;
        else report.failed.push(`advance ${held.id}: the overdue notice did not reach everyone`);
      } else if (await tellOwnerOfDeadline({ ...about, owedVnd })) {
        report.reminded += 1;
      } else {
        report.failed.push(`advance ${held.id}: the reminder did not reach its owner`);
      }
    } catch (err) {
      report.failed.push(`advance ${held.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return report;
}
