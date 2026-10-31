"use server";

// The profile editor's preview source (RP.6; spec stories 22-24): the rows of
// the export the profile's newest run was built from, read once when the
// editor opens. The browser then runs the pure engine over them on every
// valid draft, so a threshold change recounts without a round trip per
// keystroke. The reader (SheetJS) stays on the server; only the table of
// cells crosses.
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import type { Cell } from "./engine";
import { readExport } from "./read-export";
import { fetchExport, latestRunOf } from "./run-store";
import { runDay } from "./run-view";

/** The export a preview recounts against: which file, the day it was uploaded, and its rows, header first. */
export type LastExport = { runId: string; fileName: string; uploadedOn: string; rows: Cell[][] };

const FAILED = "Could not read the last export, so there is no preview. Reload the page to try again.";

/**
 * The newest run's export for a profile, as the engine reads it. `lastExport`
 * is null when the profile has no run yet, which the editor says in words; a
 * failed read, a missing file or an unreadable one is a failure, never an
 * empty preview, because "0 jobs" is an answer a manager would act on.
 */
export async function readLastExport(profileId: string): Promise<{ ok: true; lastExport: LastExport | null } | { ok: false; error: string }> {
  await requirePermission("replenishment.profiles");
  const id = z.string().uuid().safeParse(profileId);
  if (!id.success) return { ok: false, error: "Profile not found." };

  const latest = await latestRunOf(id.data);
  if (!latest.ok) {
    console.error("[replenishment/preview] latest run", latest.error);
    return { ok: false, error: FAILED };
  }
  if (!latest.run) return { ok: true, lastExport: null };

  const file = await fetchExport(latest.run.storagePath);
  if (!file.ok) {
    console.error("[replenishment/preview] export download", latest.run.storagePath, file.error);
    return { ok: false, error: FAILED };
  }
  let rows: Cell[][];
  try {
    rows = readExport(file.bytes);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : FAILED };
  }
  return { ok: true, lastExport: { runId: latest.run.id, fileName: latest.run.fileName, uploadedOn: runDay(latest.run.uploadedAt), rows } };
}
