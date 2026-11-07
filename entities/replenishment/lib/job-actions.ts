"use server";

// Working a sent run on a scanner (RP.5; spec 2026-10-28, "Commands"): finish
// a job with the BIN the operator used, reopen one to change it, and sign the
// scanner's last person out. Each opens with the work atom.
//
// A job can be worked only while its run is sent: a draft has not been
// checked, and a closed run is the record of a week that is over. The BIN is
// trimmed and never checked against a pattern, because the screen must never
// argue with what the operator can see at the shelf.
//
// Nothing here revalidates a path. The scanner keeps its own state once it has
// loaded, and the admin pages render per request, so a revalidation would only
// make every scan re-read the whole run.
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { signOutTo } from "@/kernel/identity/session";
import type { Result } from "@/kernel/data/result";
import { markJob, runOfJob } from "./run-store";

const JobId = z.string().uuid("That job was not found.");
/** The table has no length limit; this one keeps a stuck scanner from writing a page of text. */
const Bin = z.string().trim().min(1, "Scan or type the BIN first.").max(120, "That BIN is too long. Scan it again.");

/** Refuses a job that is not on a sent run, with the sentence the operator reads. */
async function sentRunOf(jobId: string): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const found = await runOfJob(jobId);
  if (!found.ok) {
    console.error("[replenishment/jobs] read", found.error);
    return { ok: false, error: "Could not reach the run. Check the signal and try again." };
  }
  if (!found.run) return { ok: false, error: "That job was not found." };
  if (found.run.status !== "sent") {
    return { ok: false, error: found.run.status === "closed" ? "This run is closed, so its jobs can't change." : "This run has not been sent to the scanners yet." };
  }
  return { ok: true, runId: found.run.id };
}

/** Finishes a job with the BIN used, as the person signed in. A job done already takes the new BIN. */
export async function completeJob(jobId: string, bin: string): Promise<Result> {
  const { personId } = await requirePermission("replenishment.work");
  const id = JobId.safeParse(jobId);
  if (!id.success) return { ok: false, error: id.error.issues[0].message };
  const used = Bin.safeParse(bin);
  if (!used.success) return { ok: false, error: used.error.issues[0].message };
  // A finished job always names who finished it (the table refuses one that does not).
  if (!personId) return { ok: false, error: "Your account has no person record, so a job can't be saved as yours. Ask an admin." };

  const run = await sentRunOf(id.data);
  if (!run.ok) return run;
  const marked = await markJob(id.data, run.runId, { bin: used.data, at: new Date().toISOString(), by: personId });
  if (!marked.ok) {
    console.error("[replenishment/jobs] complete", marked.error);
    return { ok: false, error: "Could not save the job. Try again." };
  }
  if (!marked.written) return { ok: false, error: "That job was not found." };
  return { ok: true };
}

/**
 * Opens a finished job again, clearing its BIN, time and person. Audited,
 * because the row then no longer says who finished it; a completion is not,
 * because the row itself records it.
 */
export async function reopenJob(jobId: string): Promise<Result> {
  const { user } = await requirePermission("replenishment.work");
  const id = JobId.safeParse(jobId);
  if (!id.success) return { ok: false, error: id.error.issues[0].message };

  const run = await sentRunOf(id.data);
  if (!run.ok) return run;
  const marked = await markJob(id.data, run.runId, null);
  if (!marked.ok) {
    console.error("[replenishment/jobs] reopen", marked.error);
    return { ok: false, error: "Could not reopen the job. Try again." };
  }
  if (!marked.written) return { ok: false, error: "That job was not found." };
  await recordAudit({ table: "replenishment_jobs", recordId: id.data, operation: "update", actor: user.email, newData: { done_at: null, bin_used: null, done_by: null } });
  return { ok: true };
}

/**
 * "Not you?" on a shared scanner: signs the last person out and opens the
 * Team sign-in, so nobody finishes jobs under someone else's name. The kernel
 * signs every surface out the same way; this only names the Team's sign-in.
 */
export async function notYou(): Promise<void> {
  await requirePermission("replenishment.work");
  await signOutTo("/team/login");
}
