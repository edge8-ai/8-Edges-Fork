"use server";

// The weekly run (RP.4; spec 2026-10-28, "Commands"): upload an export, check
// it, send it to the scanners, close it. Each opens with the runs atom.
//
// createRun reads the file, runs the engine once with the stored profile, keeps
// the export in the private bucket and writes the run as a draft with every
// job. A missing column or an unreadable file is refused with the reader's or
// the engine's own sentence; an export with no qualifying items is a valid,
// empty run, so "nothing to restock" never looks like a failed upload.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import { buildRun, type Run } from "./engine";
import { readExport } from "./read-export";
import { readProfile } from "./profile-store";
import { discardExport, moveRun, storeExport, writeRun } from "./run-store";

const RUNS = "/admin/operations/replenishment/runs";
const TABLE = "replenishment_runs";

/**
 * The largest export accepted. The bucket takes 20 MB, but a server action's
 * body is capped at 10 MB (next.config.mjs), and the export rides in it.
 */
const MAX_EXPORT_BYTES = 10_000_000;

/** The types the bucket accepts, by the file's extension: browsers name a CSV several ways. */
const EXPORT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

const Id = (what: string) => z.string().uuid(`${what} not found.`);

/** A storage path: the run's folder and a tidy copy of the file's name. */
function exportPath(runId: string, name: string): string {
  const tidy = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "export";
  return `runs/${runId}/${tidy}`;
}

/** Reads `form`'s profileId and file, builds the run and stores it as a draft. Answers the new run's id. */
export async function createRun(form: FormData): Promise<Result & { id?: string }> {
  const { user, personId } = await requirePermission("replenishment.runs");
  const profileId = Id("Profile").safeParse(form.get("profileId"));
  if (!profileId.success) return { ok: false, error: "Choose the profile to read the export with." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose this week's stock export." };
  if (file.size > MAX_EXPORT_BYTES) return { ok: false, error: `${file.name} is over 10 MB. Export fewer columns, or as .csv.` };
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXPORT_TYPES[extension];
  if (!contentType) return { ok: false, error: `${file.name} can't be read. Upload the export as .xlsx or .csv.` };

  const stored = await readProfile(profileId.data);
  if (!stored) return { ok: false, error: "That profile was not found, or was archived." };
  if (!stored.profile) return { ok: false, error: `The profile no longer passes its checks, so no run can be made from it. ${stored.problem}` };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let run: Run;
  try {
    run = buildRun(stored.profile, readExport(bytes));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The export could not be read." };
  }

  const id = crypto.randomUUID();
  const path = exportPath(id, file.name);
  const kept = await storeExport(path, bytes, contentType);
  if (!kept.ok) {
    console.error("[replenishment/runs] export upload", kept.error);
    return { ok: false, error: "Could not keep the export. Try again." };
  }
  const written = await writeRun({
    id,
    profileId: stored.id,
    profileVersion: stored.version,
    snapshot: stored.profile,
    fileName: file.name.slice(0, 255),
    storagePath: path,
    dataRows: run.dataRows,
    truncated: run.truncated,
    leftOut: run.leftOut,
    uploadedBy: personId,
    uploadedAt: new Date().toISOString(),
    jobs: run.jobs,
  });
  if (!written.ok) {
    console.error("[replenishment/runs] run write", written.error);
    await discardExport(path);
    return { ok: false, error: "Could not save the run. Try again." };
  }

  await recordAudit({
    table: TABLE,
    recordId: id,
    operation: "insert",
    actor: user.email,
    newData: { file_name: file.name, profile_id: stored.id, profile_version: stored.version, data_rows: run.dataRows, jobs: run.jobs.length, left_out: run.leftOut.length },
  });
  revalidatePath(RUNS);
  return { ok: true, id };
}

/** Lets the operators see a checked draft. */
export async function sendRun(runId: string): Promise<Result> {
  const { user, personId } = await requirePermission("replenishment.runs");
  const id = Id("Run").safeParse(runId);
  if (!id.success) return { ok: false, error: id.error.issues[0].message };
  const moved = await moveRun(id.data, ["draft"], "sent", personId, new Date().toISOString());
  if (!moved.ok) {
    console.error("[replenishment/runs] send", moved.error);
    return { ok: false, error: "Could not send the run. Try again." };
  }
  if (!moved.moved) return { ok: false, error: "Only a draft can be sent, and this run is not one any more. Reload the page." };
  await recordAudit({ table: TABLE, recordId: id.data, operation: "update", actor: user.email, oldData: { status: "draft" }, newData: { status: "sent" } });
  revalidatePath(RUNS);
  revalidatePath(`${RUNS}/${id.data}`);
  return { ok: true };
}

/**
 * Ends a run: a sent one when its round is over, or a draft that should never
 * be sent (the wrong export, say). A closed run stays, with its jobs, as the
 * record of that week.
 */
export async function closeRun(runId: string): Promise<Result> {
  const { user, personId } = await requirePermission("replenishment.runs");
  const id = Id("Run").safeParse(runId);
  if (!id.success) return { ok: false, error: id.error.issues[0].message };
  const moved = await moveRun(id.data, ["draft", "sent"], "closed", personId, new Date().toISOString());
  if (!moved.ok) {
    console.error("[replenishment/runs] close", moved.error);
    return { ok: false, error: "Could not close the run. Try again." };
  }
  if (!moved.moved) return { ok: false, error: "This run is closed already. Reload the page." };
  await recordAudit({ table: TABLE, recordId: id.data, operation: "update", actor: user.email, newData: { status: "closed" } });
  revalidatePath(RUNS);
  revalidatePath(`${RUNS}/${id.data}`);
  return { ok: true };
}
