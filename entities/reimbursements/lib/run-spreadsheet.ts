// A payment run as a spreadsheet (plan section 8, design §1.11): one row per
// person to pay, with the claims and the dates they were asked for, the
// amount, where the payment stands, and the bank details to pay into. Built on
// request behind reimbursements.pay, never stored and never emailed; the bank
// details in it come from the audited read the route makes first. Pure, so the
// columns are tested here and the route only wraps the bytes.
import { toCsv, type CsvRow } from "@/kernel/ui/dash/csv";
import type { PayeeBank } from "./bank-details";
import type { RunDetail } from "./run-view";

const STATE_LABEL = { to_pay: "To pay", paid: "Paid", returned: "Returned to approved" } as const;

export function runSpreadsheet(run: RunDetail, banks: Map<string, PayeeBank>): string {
  const rows: CsvRow[] = run.payments.map((p) => {
    const bank = banks.get(p.personId);
    return {
      Name: p.personName,
      Claims: p.claims.map((c) => c.title).join(" / "),
      "Request dates": p.claims.map((c) => (c.submittedAt ?? "").slice(0, 10)).join(" / "),
      "Amount (VND)": p.amountVnd,
      Status: STATE_LABEL[p.state],
      "Paid (VND)": p.paidVnd,
      Bank: bank?.bankName ?? "",
      "Account number": bank?.accountNumber ?? "",
      Branch: bank?.branch ?? "",
      "Account holder": p.personName,
    };
  });
  return toCsv(rows);
}

/** The download's file name: the run's own date, never today's. */
export function runSpreadsheetName(runDate: string): string {
  return `payment-run-${runDate}.csv`;
}
