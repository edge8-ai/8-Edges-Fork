import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { mustRows } from "@/kernel/data/read";
import { sweepUpload } from "@/entities/reimbursements/lib/document-store";
import { selectReimbursementAdvanceFiles, selectReimbursementFiles } from "@/entities/reimbursements/lib/reads";
import { deleteReimbursementAdvanceFiles, deleteReimbursementFiles } from "@/entities/reimbursements/lib/writes";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "50 19 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Receipt sweep",
  description: "Daily at 02:50. Clears receipt, red-invoice and advance uploads that were never confirmed after a day, one at a time. A document on a submitted claim is kept: the database refuses its delete, and the sweep counts it as kept. A failed read deletes nothing.",
  content: ["Reimbursement claims", "Receipts"],
  apps: ["Supabase"],
};

// Vercel cron: daily 19:50 UTC (02:50 Asia/Ho_Chi_Minh), after boards' sweep,
// when nobody is uploading. The receipts bucket's housekeeping (design §1.4):
// uploads never confirmed, older than a day — the browser stopped before the
// confirm ran, or confirm refused and its own clean-up failed.
//
// ONE ROW AT A TIME, row before object. Since 20261008090000 the database
// lets an unconfirmed receipt or red invoice go whatever its claim, so a
// refusal here should not happen; but it refuses any bank receipt, and a
// confirm can land between the read and the delete, after which the guard
// keeps a document of a claim ever submitted. A set-based delete holding
// one such row would fail as a whole and keep every other row with it
// (db-review on the schema). So each row is deleted on its own, re-checking
// what selected it; a refused row is counted as kept and keeps its object,
// because the database has said the record stays; and an object goes only once its row has. That is the reverse
// of boards' sweep, which removes the object first: boards has no guard that
// can refuse the row, and here a removed object under a refused row would be a
// kept record with no document. An object whose removal fails after its row
// went is named in `failed`, so the run is an error someone sees.
//
// Bank receipts are never read here: the guard refuses every one, and RB.7
// decides what an unfinished bank-receipt upload means.

const ROUTINE_ID = "/api/cron/receipt-sweep/";
const DAY_MS = 24 * 60 * 60 * 1000;
/** A run's ceiling, so one bad night cannot run the function out. One delete per row. */
const MAX_ROWS = 500;

type Report = { unconfirmed: number; kept: number; failed: string[] };
type PathRow = { id: string; storage_path: string };

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Advance files sit in the same bucket under the same protocol (AD.9), and a finished one is
// never deleted, so the same rules hold. An unfinished bank receipt on an advance proves
// nothing and no transfer can cite it, so unlike a claim's it goes with the rest.
// The steps are the document store's (sweepUpload), the same for both tables.
async function sweepOne(row: PathRow, createdBefore: string, report: Report, deleter: typeof deleteReimbursementFiles | typeof deleteReimbursementAdvanceFiles = deleteReimbursementFiles) {
  const swept = await sweepUpload(row.storage_path, () => deleter().eq("id", row.id).is("confirmed_at", null).lt("created_at", createdBefore).select("id"));
  if (swept.done === "kept") report.kept += 1;
  if (swept.done === "swept" || (swept.done === "failed" && swept.what === "object")) report.unconfirmed += 1;
  if (swept.done === "failed") report.failed.push(swept.what === "row" ? `row ${row.id}: ${swept.message}` : `object ${row.storage_path}: ${swept.message}`);
}

async function handler(_req: Request) {
  const report: Report = { unconfirmed: 0, kept: 0, failed: [] };
  const createdBefore = new Date(Date.now() - DAY_MS).toISOString();
  try {
    // A must-read: nothing is deleted on the strength of an answer not given.
    const stale = mustRows(
      await selectReimbursementFiles("id, storage_path")
        .is("confirmed_at", null)
        .neq("kind", "bank_receipt")
        .lt("created_at", createdBefore)
        .order("created_at")
        .limit(MAX_ROWS),
      "unconfirmed uploads older than a day",
    ) as unknown as PathRow[];
    for (const row of stale) await sweepOne(row, createdBefore, report);
  } catch (err) {
    console.error("[receipt-sweep]", messageOf(err));
    report.failed.push(`unconfirmed uploads: ${messageOf(err)}`);
  }
  try {
    const staleOnAdvances = mustRows(
      await selectReimbursementAdvanceFiles("id, storage_path").is("confirmed_at", null).lt("created_at", createdBefore).order("created_at").limit(MAX_ROWS),
      "unconfirmed advance uploads older than a day",
    ) as unknown as PathRow[];
    for (const row of staleOnAdvances) await sweepOne(row, createdBefore, report, deleteReimbursementAdvanceFiles);
  } catch (err) {
    console.error("[receipt-sweep]", messageOf(err));
    report.failed.push(`unconfirmed advance uploads: ${messageOf(err)}`);
  }
  // Anything the sweep could not do makes an error run that names it (Y.13).
  return routineResult({
    status: "ok",
    ...report,
    failures: failuresFrom(report.failed, "sweep", "receipt sweep"),
  });
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
