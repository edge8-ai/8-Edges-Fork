import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

// What happens around a deal's stage move, shared by every path that moves one
// (the board drag, the detail page, the bulk editor, the lead hand-off that
// creates a deal): the forecast gate (RH-2). The stage log is the database's
// since ADR-0011.
//
// The gate: an open deal entering Proposal, or any open stage after it, must
// carry an amount and an expected close date. Both feed the forecast; a deal
// missing either sat on the pipeline board looking real and was missing from
// every forecast chart. The rule is on the deal, not the person: it says what
// the deal is missing, and nothing here counts refusals.
//
// The log: one append-only row per move, the pattern task_stage_log follows,
// written by a trigger for every writer. Aging in stage and conversion by stage
// read it; the deal detail shows it. moved_by is the audit label and is never
// grouped for a figure.

export const FORECAST_GATE_STAGE = "Proposal";

export type StageRow = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
export type ForecastInputs = { amount_cents: number | null; expected_close_date: string | null };

// The message when the deal may not enter the stage, or null when it may.
// `incoming` is what the same request is about to write, so a form that fills
// the amount and moves the stage in one save is not refused for the old row.
export function forecastInputsError(
  stages: StageRow[],
  toStageId: string,
  deal: ForecastInputs,
  incoming: Partial<ForecastInputs> = {},
): string | null {
  const to = gatedStage(stages, toStageId);
  if (!to) return null;
  const amount = incoming.amount_cents !== undefined ? incoming.amount_cents : deal.amount_cents;
  const close = incoming.expected_close_date !== undefined ? incoming.expected_close_date : deal.expected_close_date;
  const missing: string[] = [];
  if (!amount || amount <= 0) missing.push("an amount");
  if (!close) missing.push("an expected close date");
  if (missing.length === 0) return null;
  return `${to.name} needs ${missing.join(" and ")} on the deal first, so the forecast can count it.`;
}

// The stage when it is open and at or after Proposal, so the gate applies; null
// otherwise, including a pipeline with no Proposal stage and an unknown id.
function gatedStage(stages: StageRow[], stageId: string | null): StageRow | null {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage || stage.is_won || stage.is_lost) return null;
  const gate = stages.find((s) => s.name === FORECAST_GATE_STAGE && !s.is_won && !s.is_lost);
  return gate && stage.position >= gate.position ? stage : null;
}

// The forecast inputs an edit empties: present in the patch and blank. A field
// the edit leaves out is not judged, which is what lets a deal that reached
// Proposal before the gate existed be given its missing input one at a time.
export function clearedForecastInputs(incoming: Partial<ForecastInputs>): string[] {
  const cleared: string[] = [];
  if (incoming.amount_cents !== undefined && !(incoming.amount_cents && incoming.amount_cents > 0)) cleared.push("an amount");
  if (incoming.expected_close_date !== undefined && !incoming.expected_close_date) cleared.push("an expected close date");
  return cleared;
}

// The gate's second door (R.23): an edit may not take an input away from a deal
// already in a gated stage. Without it a deal could enter Proposal properly, then
// have its amount cleared and drop out of every forecast chart while still
// sitting on the board looking real, which is what the gate exists to stop.
export function forecastEditError(stages: StageRow[], stageId: string | null, incoming: Partial<ForecastInputs>): string | null {
  const cleared = clearedForecastInputs(incoming);
  if (cleared.length === 0) return null;
  const stage = gatedStage(stages, stageId);
  if (!stage) return null;
  return `A deal in ${stage.name} keeps ${cleared.join(" and ")}, so the forecast can count it.`;
}

export type ForecastDealRow = { id: string; stage_id: string | null } & ForecastInputs;

// The same rule for a write whose text cannot be trusted to say what it does:
// the admin assistant's approved SQL (R.23). It compares the deals before and
// after the statement, inside its transaction, and refuses when a deal in a
// gated stage held an input before and does not after. An input the deal never
// had is not the write's loss, so a pre-gate deal still takes its other one.
export function forecastLossError(stages: StageRow[], before: ForecastDealRow[], after: ForecastDealRow[]): string | null {
  const was = new Map(before.map((d) => [d.id, d]));
  for (const now of after) {
    const prev = was.get(now.id);
    if (!prev) continue;
    const lost: Partial<ForecastInputs> = {};
    if (clearedForecastInputs({ amount_cents: prev.amount_cents }).length === 0) lost.amount_cents = now.amount_cents;
    if (clearedForecastInputs({ expected_close_date: prev.expected_close_date }).length === 0) lost.expected_close_date = now.expected_close_date;
    const error = forecastEditError(stages, now.stage_id, lost);
    if (error) return error;
  }
  return null;
}

export type StageContext = { stageId: string | null } & ForecastInputs;

// The deal's current stage and forecast inputs, read once before a move so the
// gate can judge and the log can record where the deal came from.
export async function loadStageContext(dealId: string): Promise<{ ok: true; deal: StageContext; stages: StageRow[] } | { ok: false; error: string }> {
  const [dealRes, stagesRes] = await Promise.all([
    companyOs.from("deals").select("stage_id, amount_cents, expected_close_date").eq("id", dealId).maybeSingle(),
    companyOs.from("pipeline_stages").select("id, name, position, is_won, is_lost").order("position"),
  ]);
  if (dealRes.error) return { ok: false, error: dealRes.error.message };
  if (stagesRes.error) return { ok: false, error: stagesRes.error.message };
  const d = (dealRes.data ?? { stage_id: null, amount_cents: null, expected_close_date: null }) as { stage_id: string | null; amount_cents: number | null; expected_close_date: string | null };
  return { ok: true, deal: { stageId: d.stage_id, amount_cents: d.amount_cents, expected_close_date: d.expected_close_date }, stages: (stagesRes.data ?? []) as StageRow[] };
}

// What a deal takes on when it enters a stage: the stage's default probability,
// when the stage has one. Applied on entry only, so a rep's later override
// sticks. Pure, so the rule is testable without a database.
export function stageEntryPatch(stage: { is_won: boolean; is_lost: boolean; default_probability: number | null }): { probability?: number } {
  if (stage.is_won || stage.is_lost) return {};
  return stage.default_probability == null ? {} : { probability: stage.default_probability };
}

export type NewDealRow = TablesInsert<{ schema: "company_os" }, "deals"> & { stage_id: string };

// The one way to create a deal (the SDR hand-off, the portal's Build Your Team
// request). The stage log's first row is written by the database as the row
// lands, taking its mover and note from the row (ADR-0011).
export async function createDeal(row: NewDealRow, meta: { movedBy: string | null; note?: string | null }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("deals")
    .insert({ ...row, stage_moved_by: meta.movedBy, stage_move_note: meta.note ?? null })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "The deal was not created." };
  return { ok: true, id: data.id };
}

export type StageHistoryRow = { id: string; from_stage_id: string | null; to_stage_id: string | null; kind: string; moved_at: string; note: string | null };

export async function readDealStageHistory(dealId: string): Promise<StageHistoryRow[]> {
  const { data, error } = await companyOs
    .from("deal_stage_log")
    .select("id, from_stage_id, to_stage_id, kind, moved_at, note")
    .eq("deal_id", dealId)
    .order("moved_at", { ascending: false });
  if (error) {
    console.error("[crm] deal_stage_log", error);
    return [];
  }
  return (data ?? []) as StageHistoryRow[];
}
