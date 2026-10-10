import { NextResponse } from "next/server";
import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { pingOps } from "@/entities/portal";
import { periodMonth, rollupContractorPayments } from "@/entities/company-os/lib/contractor-payments";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 6 1 * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Contractor payments",
  description: "Rolls the previous month's accepted contractor work into payment requests, on the 1st.",
  content: ["Contractor work", "Payment requests"],
  apps: ["Supabase"],
};

// Vercel cron (see vercel.json): 1st of the month, 06:00 UTC. Rolls the
// previous month's accepted contractor work into payment requests. It is a
// company-os cron (Q2): the roll-up writes contractor_payments, a company-os
// table, and the cron is the only door-graph consumer the roll-up had, so
// with the cron beside it the roll-up stays out of company-os's door graph
// and its portal writers no longer make company-os reach a higher layer. Auth is
// the standard Vercel Cron bearer scheme — enforced whenever CRON_SECRET is
// set (it is, in production).
async function handler(req: Request) {
  const period = periodMonth(-1);
  const result = await rollupContractorPayments(period);
  if ("error" in result) {
    console.error("[contractor-payments cron] failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  if (result.created + result.updated > 0 || result.skipped.length > 0) {
    await pingOps(
      `💸 Contractor payment roll-up for ${period}: ${result.created} created, ${result.updated} updated, ${result.requestsLinked} work items.` +
        (result.skipped.length ? `\nSkipped: ${result.skipped.join("; ")}` : "") +
        `\nReview: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/operations/contractor-payments`,
    );
  }

  // A contractor whose payment could not be written is a failure that names
  // them; contractors skipped by design (no rate, already decided) are not.
  const nothingToDo = result.created + result.updated === 0 && result.skipped.length === 0;
  return routineResult({
    status: nothingToDo ? "skipped" : "ok",
    ...(nothingToDo ? { reason: `no accepted contractor work to roll up for ${period}` } : {}),
    ...result,
    failures: failuresFrom(result.failed, "roll up payment", "contractor payments"),
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/contractor-payments/", req, handler);
