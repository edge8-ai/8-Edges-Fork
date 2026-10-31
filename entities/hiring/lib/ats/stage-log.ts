import { randomUUID } from "crypto";
import { companyOs } from "@/kernel/data/supabase";

// Append a row to company_os.application_stage_log every time an application's
// current_stage_id changes, so the detail page can show how long a candidate has
// sat in their current stage. The table already exists but nothing wrote to it,
// so days-in-stage only becomes available for moves that happen from now on;
// older applications fall back to their applied date until they next move.
//
// Best-effort by design: a logging failure must never fail the stage move that
// just succeeded, so this never throws. id and moved_at have no DB defaults, so
// both are set explicitly.
export async function logStageMove(
  applicationId: string,
  fromStageId: string | null,
  toStageId: string | null,
): Promise<void> {
  if (fromStageId === toStageId) return; // not a real move
  try {
    const { error } = await companyOs.from("application_stage_log").insert({
      id: randomUUID(),
      application_id: applicationId,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      moved_at: new Date().toISOString(),
    });
    if (error) console.warn("logStageMove: could not record stage move", error.message);
  } catch (err) {
    console.warn("logStageMove: unexpected failure", err);
  }
}

// The timestamp the application entered its current stage — the most recent move
// into that stage. Returns null when there is no logged move (older applications),
// so the caller can fall back to another signal.
export async function stageEnteredAt(applicationId: string, stageId: string): Promise<string | null> {
  const { data, error } = await companyOs.from("application_stage_log").select("moved_at")
    .eq("application_id", applicationId)
    .eq("to_stage_id", stageId)
    .order("moved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data?.moved_at as string | null) ?? null;
}
