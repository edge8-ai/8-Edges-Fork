// Building a payment run (design §1.7, RB.6): on the 1st and the 15th, every
// claim approved before 00:00 Vietnam time that day goes into one run, one
// payment per person, and accounting@ and the Operations chat are told once.
//
// `buildPaymentRun` is the one way a run is built. The cron calls it on the
// day; the payer's "Build the run for <date>" button calls it for a tick
// Vercel missed (decision 6). It is idempotent, without a database function:
//
// 1. Nothing approved before the cut-off and no run yet: no run, no notice.
// 2. The run row is keyed by its date (`run_date` is unique), so a second
//    build that day finds the row the first one wrote.
// 3. Each eligible claim enters through the lifecycle module, guarded on still
//    being approved, so it gets its history row and a rerun moves nothing twice.
//    A claim a failed transfer returned from this run never re-enters it: it
//    waits for the next run, as its owner was told.
// 4. One payment per person, its amount the sum of the totals frozen at
//    approval (never a recount). A payment already recorded as paid is never
//    reopened: a late claim of that person waits for the next run.
// 5. The run's counts and total are recomputed from its claims.
// 6. The notices go only while `notified_at` is empty, and it is claimed
//    first, so a retry never sends twice.
import { saigonToday } from "@/kernel/config/dates";
import { claimWriterFor, transitionClaim, type ClaimActor } from "./claim-lifecycle";
import { CLAIM_ROW_COLUMNS, claimRowFrom } from "./own-claims";
import { tellOfRunBuilt } from "./notices";
import { announce } from "./claim-events";
import { selectReimbursementClaimEvents, selectReimbursementClaims, selectReimbursementPaymentRuns, selectReimbursementPayments } from "./reads";
import { cutoffOf, isRunDay, paymentsOf, runTotalsOf } from "./run-rules";
import { insertReimbursementPayments, updateReimbursementClaims, updateReimbursementPaymentRuns, updateReimbursementPayments, upsertReimbursementPaymentRuns } from "./writes";

export type BuildAnswer =
  | { ok: true; built: false; reason: string }
  | {
      ok: true;
      built: true;
      runId: string;
      runDate: string;
      /** Claims this build put in the run (none on a rerun). */
      entered: number;
      claims: number;
      people: number;
      totalVnd: number;
      /** Whether this build sent the run's notices; false when an earlier build already had. */
      notified: boolean;
      /** Eligible claims left for the next run: their person was already paid in this one, the run is paid, or a failed transfer returned them from it. */
      waiting: string[];
      /** Claims that could not be moved, with why; the run is built without them. */
      failed: string[];
    }
  | { ok: false; error: string };

const NOTHING = "Nothing was approved before the cut-off, so there is no run.";

/** The cron's identity on a claim's history: no person, and who pressed the button when a payer did. */
function runActor(by: string | null): ClaimActor {
  return { kind: "cron", personId: null, mayDecideOwn: false, label: by ?? "cron:payment-run" };
}

/**
 * Builds the run for `runDate` (a 1st or a 15th), or finds the one already
 * built, and brings it up to date. `by` names a payer who pressed the button,
 * for the history's audit label; the cron passes nothing.
 */
export async function buildPaymentRun(runDate: string, opts: { by?: string | null } = {}): Promise<BuildAnswer> {
  if (!isRunDay(runDate)) return { ok: false, error: "A run is built on the 1st or the 15th." };
  if (runDate > saigonToday()) return { ok: false, error: "That run date has not come yet." };
  const cutoff = cutoffOf(runDate);

  const eligibleRead = await selectReimbursementClaims(`${CLAIM_ROW_COLUMNS}, approved_total_vnd`)
    .eq("status", "approved")
    .lt("approved_at", cutoff)
    .is("payment_run_id", null)
    .order("approved_at");
  if (eligibleRead.error) return { ok: false, error: `Could not read the approved claims: ${eligibleRead.error.message}` };
  const eligible = eligibleRead.data ?? [];

  const existingRead = await selectReimbursementPaymentRuns("id, status, notified_at").eq("run_date", runDate).maybeSingle();
  if (existingRead.error) return { ok: false, error: `Could not read the run: ${existingRead.error.message}` };
  if (eligible.length === 0 && !existingRead.data) return { ok: true, built: false, reason: NOTHING };

  let run = existingRead.data as { id: string; status: string; notified_at: string | null } | null;
  if (!run) {
    const upserted = await upsertReimbursementPaymentRuns({ run_date: runDate, cutoff_at: cutoff }).select("id, status, notified_at").single();
    if (upserted.error || !upserted.data) return { ok: false, error: `Could not start the run: ${upserted.error?.message ?? "no row"}` };
    run = upserted.data as { id: string; status: string; notified_at: string | null };
  }
  const runId = String(run.id);

  const paymentsRead = await selectReimbursementPayments("id, person_id, status").eq("run_id", runId);
  if (paymentsRead.error) return { ok: false, error: `Could not read the run's payments: ${paymentsRead.error.message}` };
  const payments = (paymentsRead.data ?? []).map((p) => ({ id: String(p.id), personId: String(p.person_id), status: String(p.status) }));
  const paidPeople = new Set(payments.filter((p) => p.status === "paid").map((p) => p.personId));

  // A claim whose transfer failed was returned from this run to approved, and
  // its owner was told it is paid in the next run (decision 5). It is still
  // approved before this run's cut-off, so without this a second build of the
  // same date would take it straight back.
  // A run this build just started has returned nothing yet.
  const returnedHere = existingRead.data ? await returnedFrom(runId, payments.map((p) => p.id), eligible.map((c) => String(c.id))) : { ok: true as const, ids: new Set<string>() };
  if (!returnedHere.ok) return returnedHere;

  const actor = runActor(opts.by ?? null);
  const waiting: string[] = [];
  const failed: string[] = [];
  let entered = 0;
  for (const c of eligible) {
    const row = claimRowFrom(c);
    if (run.status === "paid" || paidPeople.has(row.personId) || returnedHere.ids.has(row.id)) {
      waiting.push(row.id);
      continue;
    }
    const moved = await transitionClaim({ row, move: "enter_run", actor, write: claimWriterFor(row.id, {}), runId });
    if (moved.ok) entered += 1;
    else failed.push(`${row.id}: ${moved.error}`);
  }

  const inRunRead = await selectReimbursementClaims("id, person_id, status, approved_total_vnd").eq("payment_run_id", runId);
  if (inRunRead.error) return { ok: false, error: `Could not read the run's claims: ${inRunRead.error.message}` };
  const inRun = (inRunRead.data ?? []).map((c) => ({
    id: String(c.id),
    personId: String(c.person_id),
    status: String(c.status),
    approvedTotalVnd: Number(c.approved_total_vnd ?? 0),
  }));

  for (const group of paymentsOf(inRun.filter((c) => c.status === "in_run" && !paidPeople.has(c.personId)))) {
    const linked = await upsertPayment(runId, group.personId, group.amountVnd, payments);
    if (!linked.ok) {
      failed.push(`payment for ${group.personId}: ${linked.error}`);
      continue;
    }
    const link = await updateReimbursementClaims({ payment_id: linked.id })
      .eq("payment_run_id", runId)
      .eq("person_id", group.personId)
      .eq("status", "in_run")
      .select("id");
    if (link.error) failed.push(`claims of ${group.personId}: ${link.error.message}`);
  }

  const totals = runTotalsOf(inRun);
  const saved = await updateReimbursementPaymentRuns(totals).eq("id", runId);
  if (saved.error) failed.push(`the run's totals: ${saved.error.message}`);

  let notified = false;
  if (!run.notified_at && totals.claims_count > 0) {
    // Claimed before anything is sent: a retry finds it set and sends nothing.
    const claimed = await updateReimbursementPaymentRuns({ notified_at: new Date().toISOString() }).eq("id", runId).is("notified_at", null).select("id");
    if (claimed.error) failed.push(`the run's notice: ${claimed.error.message}`);
    else if ((claimed.data ?? []).length > 0) {
      notified = true;
      const built = { runId, runDate, people: totals.people_count, claims: totals.claims_count, totalVnd: totals.total_vnd };
      await tellOfRunBuilt(built);
      await announce("payment-run.built", built);
    }
  }

  if (failed.length > 0) console.error("[reimbursements] the payment run was built with failures", runDate, failed);
  return { ok: true, built: true, runId, runDate, entered, claims: totals.claims_count, people: totals.people_count, totalVnd: totals.total_vnd, notified, waiting, failed };
}

/**
 * Which of these claims a failed transfer returned from this run: their
 * history's in_run → approved row names the run, or one of its payments.
 */
async function returnedFrom(runId: string, paymentIds: string[], claimIds: string[]): Promise<{ ok: true; ids: Set<string> } | { ok: false; error: string }> {
  if (claimIds.length === 0) return { ok: true, ids: new Set() };
  const { data, error } = await selectReimbursementClaimEvents("claim_id, metadata").in("claim_id", claimIds).eq("from_status", "in_run").eq("to_status", "approved");
  if (error) return { ok: false, error: `Could not read which claims were returned from the run: ${error.message}` };
  const payments = new Set(paymentIds);
  const ids = new Set<string>();
  for (const e of data ?? []) {
    const m = (e.metadata ?? {}) as { runId?: unknown; paymentId?: unknown };
    if (m.runId === runId || (typeof m.paymentId === "string" && payments.has(m.paymentId))) ids.add(String(e.claim_id));
  }
  return { ok: true, ids };
}

/** The person's payment in the run, created or brought up to the sum of their claims while it is still to pay. */
async function upsertPayment(
  runId: string,
  personId: string,
  amountVnd: number,
  existing: { id: string; personId: string; status: string }[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mine = existing.find((p) => p.personId === personId);
  if (mine) {
    const { error } = await updateReimbursementPayments({ amount_vnd: amountVnd }).eq("id", mine.id).eq("status", "to_pay");
    return error ? { ok: false, error: error.message } : { ok: true, id: mine.id };
  }
  const { data, error } = await insertReimbursementPayments({ run_id: runId, person_id: personId, amount_vnd: amountVnd }).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "no row" };
  return { ok: true, id: String(data.id) };
}
