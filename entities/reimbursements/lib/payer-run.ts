// One run as the payer works on it: the run, and its people's bank details
// through the audited read (design §1.11). The Team Finance page, its Admin
// mirror and both spreadsheet routes start here, after their guard
// (reimbursements.pay), so the four agree on what is read and every read is
// audited the same way.
import { NextResponse } from "next/server";
import { isUuid } from "@/kernel/config/slug";
import { readRunBankDetails, type BankReadPurpose, type PayeeBank } from "./bank-details";
import { readPaymentRun, type RunDetail } from "./run-view";
import { runSpreadsheet, runSpreadsheetName } from "./run-spreadsheet";

/** The run with the bank details of the people still to pay, or null when there is no such run. */
export async function readRunForPayer(runId: string, actor: string | null, purpose: BankReadPurpose): Promise<{ run: RunDetail; banks: Map<string, PayeeBank> } | null> {
  const run = await readPaymentRun(runId);
  if (!run) return null;
  // Only the people the payer may still have to pay: a paid payment shows its
  // masked snapshot, and a returned one has nothing left to pay.
  const personIds = run.payments.filter((p) => p.state === "to_pay").map((p) => p.personId);
  const banks = await readRunBankDetails({ runId, personIds, actor, purpose });
  return { run, banks };
}

/**
 * The run's spreadsheet as both surfaces' routes serve it, after their guard:
 * built on request, the bank reads audited before the bytes exist, never
 * stored, never cached, never emailed. 404 when there is no such run.
 */
export async function runSpreadsheetResponse(runId: string, actor: string | null): Promise<Response> {
  const notFound = () => NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (!isUuid(runId)) return notFound();
  const read = await readRunForPayer(runId, actor, "run_spreadsheet");
  if (!read) return notFound();
  return new NextResponse(runSpreadsheet(read.run, read.banks), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${runSpreadsheetName(read.run.runDate)}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
