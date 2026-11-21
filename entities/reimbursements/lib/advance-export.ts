// Account 141 for Finance (AD.10, design section 9): for a month, one row per ledger event of
// every advance, grouped by person, each with the balance that person holds after it. The file
// starts each person from what they held before the month, so it reconciles on its own.
//
// It names accounts as columns Finance may override, never as the code's opinion, and carries
// each person's kind, so a contractor's can go to 331 if Finance decides that. The arithmetic
// credits only up to what was advanced, as advance-books' does, and a test compares the two
// for every ending, so the file cannot disagree with what the advance's page shows.
//
// The caller's guard is reimbursements.pay. A failed read raises: a file with a person missing
// would balance and be wrong.
import { businessDate } from "@/kernel/config/dates";
import { NAME_ONLY_COLUMNS, personName } from "@/kernel/config/people-name";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { toCsv, type CsvRow } from "@/kernel/ui/dash/csv";
import type { BookTransfer } from "./advance-books";
import { advanceRef } from "./advance-rules";
import { selectReimbursementAdvances, selectReimbursementAdvanceTransfers } from "./reads";

export type ExportAdvance = {
  id: string;
  refNo: number;
  personId: string;
  person: string;
  kind: string;
  purpose: string;
  amountVnd: number;
  spentVnd: number | null;
  closedOn: string | null;
  claimId: string | null;
  transfers: BookTransfer[];
};

type Movement = { on: string; advance: ExportAdvance; entry: string; debitAccount: string; creditAccount: string; amountVnd: number; debitVnd: number; creditVnd: number; claimId: string };

/**
 * Every event of one advance. A close whose history row was lost has no date of its own, so it
 * takes the payout's rather than falling out of the file: the balance must hold, and the entry
 * says so.
 */
function movementsOf(a: ExportAdvance): Movement[] {
  const out: Movement[] = [];
  const payout = a.transfers.find((t) => t.direction === "out");
  for (const t of a.transfers.filter((x) => x.direction === "out")) {
    out.push({ on: t.transferredOn, advance: a, entry: "Payout", debitAccount: "141", creditAccount: "112", amountVnd: t.amountVnd, debitVnd: t.amountVnd, creditVnd: 0, claimId: "" });
  }
  if (a.spentVnd !== null) {
    const on = a.closedOn ?? payout?.transferredOn ?? "";
    const dated = a.closedOn ? "" : " (date from the payout: the close's history is missing)";
    const kept = Math.min(a.spentVnd, a.amountVnd);
    if (a.spentVnd > 0) out.push({ on, advance: a, entry: `Settlement${dated}`, debitAccount: "Expense", creditAccount: "141", amountVnd: kept, debitVnd: 0, creditVnd: kept, claimId: a.claimId ?? "" });
    else out.push({ on, advance: a, entry: `Nothing spent${dated}`, debitAccount: "", creditAccount: "", amountVnd: 0, debitVnd: 0, creditVnd: 0, claimId: "" });
    // What the company still owes is a claim the run pays. It is spend, and it never touches 141.
    if (a.spentVnd > a.amountVnd) out.push({ on, advance: a, entry: `Difference, paid by the run${dated}`, debitAccount: "Expense", creditAccount: "Payable", amountVnd: a.spentVnd - a.amountVnd, debitVnd: 0, creditVnd: 0, claimId: a.claimId ?? "" });
  }
  for (const t of a.transfers.filter((x) => x.direction === "in")) {
    out.push({ on: t.transferredOn, advance: a, entry: "Returned by transfer", debitAccount: "112", creditAccount: "141", amountVnd: t.amountVnd, debitVnd: 0, creditVnd: t.amountVnd, claimId: "" });
  }
  return out;
}

const net = (m: Movement[]) => m.reduce((sum, x) => sum + x.debitVnd - x.creditVnd, 0);

/**
 * The month's rows, person by person: an opening row when they held something coming in, each
 * event with the balance after it, and a closing row. Someone with no event and nothing held
 * is left out. Pure.
 */
export function account141Rows(advances: readonly ExportAdvance[], month: string): CsvRow[] {
  const byPerson = new Map<string, ExportAdvance[]>();
  for (const a of advances) byPerson.set(a.personId, [...(byPerson.get(a.personId) ?? []), a]);
  const people = [...byPerson.values()].sort((a, b) => a[0].person.localeCompare(b[0].person));

  const rows: CsvRow[] = [];
  for (const theirs of people) {
    const all = theirs.flatMap(movementsOf);
    const before = all.filter((m) => m.on.slice(0, 7) < month);
    // Stable, so one advance's payout, settlement and returns stay in that order on one day.
    const during = all.filter((m) => m.on.slice(0, 7) === month).map((m, i) => ({ m, i })).sort((a, b) => a.m.on.localeCompare(b.m.on) || a.i - b.i).map(({ m }) => m);
    const opening = net(before);
    if (during.length === 0 && opening === 0) continue;
    // Every key in the order the file reads: the header is taken from the first row.
    const blank = { Person: theirs[0].person, Kind: theirs[0].kind, Advance: "", Purpose: "", Date: "", Entry: "", "Debit account": "", "Credit account": "", Amount: "", "Debit 141": "", "Credit 141": "", "Balance 141": 0, Claim: "" };
    rows.push({ ...blank, Date: `${month}-01`, Entry: "Opening balance", "Balance 141": opening });
    let balance = opening;
    for (const m of during) {
      balance += m.debitVnd - m.creditVnd;
      rows.push({
        ...blank,
        Advance: advanceRef(m.advance.refNo),
        Purpose: m.advance.purpose,
        Date: m.on,
        Entry: m.entry,
        "Debit account": m.debitAccount,
        "Credit account": m.creditAccount,
        Amount: m.amountVnd,
        "Debit 141": m.debitVnd || "",
        "Credit 141": m.creditVnd || "",
        "Balance 141": balance,
        Claim: m.claimId,
      });
    }
    rows.push({ ...blank, Date: "", Entry: "Closing balance", "Balance 141": balance });
  }
  return rows;
}

export function account141Csv(advances: readonly ExportAdvance[], month: string): string {
  return toCsv(account141Rows(advances, month));
}

/** Every advance money ever moved on, with its ledger. */
export async function readAdvancesForExport(): Promise<ExportAdvance[]> {
  const rows = mustRows(
    await selectReimbursementAdvances(`id, ref_no, person_id, team_member_id, purpose, amount_vnd, spent_vnd, settled_claim_id, person:people!reimbursement_advances_person_id_fkey(${NAME_ONLY_COLUMNS})`).not("paid_out_at", "is", null).order("created_at"),
    "[reimbursements] advances for the export",
  ) as unknown as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => String(r.id));
  const [transferRows, eventRows, memberRows] = await Promise.all([
    selectReimbursementAdvanceTransfers("advance_id, direction, amount_vnd, transferred_on").in("advance_id", ids).order("transferred_on"),
    companyOs.from("reimbursement_advance_events").select("advance_id, created_at").in("advance_id", ids).in("move", ["close", "return_unspent"]),
    companyOs.from("team_members").select("id, employment_type").in("id", [...new Set(rows.map((r) => String(r.team_member_id)))]),
  ]);
  const transfers = mustRows(transferRows, "[reimbursements] transfers for the export");
  const closed = new Map(mustRows(eventRows, "[reimbursements] closes for the export").map((e) => [String(e.advance_id), businessDate(String(e.created_at))]));
  const kind = new Map(mustRows(memberRows, "[reimbursements] kinds for the export").map((m) => [String(m.id), String(m.employment_type ?? "")]));
  return rows.map((r) => ({
    id: String(r.id),
    refNo: Number(r.ref_no),
    personId: String(r.person_id),
    person: personName(r.person as Parameters<typeof personName>[0], "Someone"),
    kind: kind.get(String(r.team_member_id)) ?? "",
    purpose: String(r.purpose),
    amountVnd: Number(r.amount_vnd),
    spentVnd: r.spent_vnd === null || r.spent_vnd === undefined ? null : Number(r.spent_vnd),
    closedOn: closed.get(String(r.id)) ?? null,
    claimId: (r.settled_claim_id as string | null) ?? null,
    transfers: transfers
      .filter((t) => t.advance_id === r.id)
      .map((t) => ({ direction: t.direction === "out" ? ("out" as const) : ("in" as const), amountVnd: Number(t.amount_vnd), transferredOn: String(t.transferred_on) })),
  }));
}
