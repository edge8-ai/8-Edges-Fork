import { companyOs, type CompanyOsInsert, type CompanyOsUpdate } from "@/kernel/data/supabase";
import type { Result } from "@/kernel/data/result";
import { refreshFxRate } from "./deal-fx";
import { announceDealWon, becomesWon, bumpCompanyLifecycle, bumpPersonCompanies, getLead, recordTransition } from "./lifecycle";
import { forecastInputsError, loadStageContext, stageEntryPatch } from "./deal-stage";

// Closing a deal, reopening one, and setting one aside (CONTEXT.md; ADR-0011).
//
// A deal's stage is the whole truth about it. The database keeps status,
// closed_at and the stage log in step with the stage whoever writes the row
// (supabase/migrations/20260927230000). What a trigger cannot do lives here,
// once: the person's lead, the customer bump on a win, and the announcement of
// the win. Before this module the board's move carried those, a rejected
// handoff recorded a loss in an open stage, a bulk reopen left the lead where
// it was, and a skill and the admin chatbot closed deals by SQL with none of it.
//
// Every caller keeps its own guard (ADR-0007); nothing here authorises.

// The reasons a deal may be lost for.
export const LOST_REASONS = new Set(["price", "competitor", "no_decision", "bad_fit", "bad_timing", "ghosted", "other"]);

type Kind = "open" | "won" | "lost";

const kindOf = (s: { is_won: boolean; is_lost: boolean } | null | undefined): Kind =>
  s?.is_won ? "won" : s?.is_lost ? "lost" : "open";

export type LeadAction = "none" | "retire" | "nurture" | "open_deal";

/**
 * What a stage move does to the person's lead. Pure, and the whole rule:
 *
 * - into Won: the lead retires (a customer is not being worked);
 * - into Lost: back to nurture, unless another live deal stands (an open one,
 *   or a won one: already a customer);
 * - out of Won or Lost into an open stage (a reopen): on an open deal again,
 *   unless another won deal stands: a customer has no lead;
 * - between open stages, or within the same kind: nothing.
 */
export function leadConsequence(input: {
  from: Kind;
  to: Kind;
  hasLead: boolean;
  leadStatus: string | null;
  otherLiveDeals: number;
  isCustomer?: boolean;
}): LeadAction {
  if (input.from === input.to) return "none";
  if (input.to === "won") return input.hasLead ? "retire" : "none";
  if (input.to === "lost") {
    if (input.otherLiveDeals > 0) return "none";
    return input.leadStatus === "nurture" ? "none" : "nurture";
  }
  if (input.isCustomer) return "none";
  return input.leadStatus === "open_deal" ? "none" : "open_deal";
}

export type Mover = { email: string; personId: string | null };

/**
 * Move a deal to a stage, with everything that follows from it.
 *
 * Losing needs an enumerated reason; winning needs the final amount in the
 * deal's own currency, so won revenue is never a guess; Proposal and later need
 * the forecast inputs. The stage write carries its mover, which the stage log
 * records. The lead, the customer bump and the announcement follow the write,
 * and a failed lead sync is reported only after the win has been announced: the
 * row already says won, and a retry is a won-to-won move that announces nothing.
 */
export async function moveDealToStage(input: {
  dealId: string;
  toStageId: string;
  mover: Mover;
  lostReason?: string;
  wonAmount?: number;
  note?: string | null;
}): Promise<Result> {
  const { dealId, toStageId, mover, lostReason, wonAmount } = input;
  const { data: stage, error: stageErr } = await companyOs
    .from("pipeline_stages")
    .select("name, is_won, is_lost, default_probability")
    .eq("id", toStageId)
    .maybeSingle();
  if (stageErr || !stage) return { ok: false, error: stageErr?.message ?? "Unknown stage." };

  if (stage.is_lost && (!lostReason || !LOST_REASONS.has(lostReason))) {
    return { ok: false, error: "Losing a deal needs a reason." };
  }
  if (stage.is_won && (wonAmount == null || !Number.isFinite(wonAmount) || wonAmount <= 0)) {
    return { ok: false, error: "Marking a deal won needs the final deal amount." };
  }

  const ctx = await loadStageContext(dealId);
  if (!ctx.ok) return ctx;
  const gate = forecastInputsError(ctx.stages, toStageId, ctx.deal);
  if (gate) return { ok: false, error: gate };
  const from = kindOf(ctx.stages.find((s) => s.id === ctx.deal.stageId) as { is_won: boolean; is_lost: boolean } | undefined);
  const to = kindOf(stage);

  // No status, closed_at or stage-log row: the database derives all three from
  // the stage (ADR-0011).
  const updates: CompanyOsUpdate<"deals"> = {
    stage_id: toStageId,
    stage_moved_by: mover.email,
    stage_move_note: input.note ?? null,
  };
  if (stage.is_lost) updates.lost_reason = lostReason;
  if (stage.is_won && wonAmount != null) {
    const cents = Math.round(wonAmount * 100);
    updates.amount_cents = cents;
    const { data: existing, error: existingErr } = await companyOs.from("deals").select("currency").eq("id", dealId).maybeSingle();
    if (existingErr) return { ok: false, error: existingErr.message };
    // The database converts the won amount as the row lands (R.24), so the
    // win is priced at the close date's rate once the cache is current. A
    // flaky rate never blocks closing it, and a currency with no cached rate
    // announces no amount.
    await refreshFxRate(existing?.currency ?? "usd");
  }
  // The stage's default probability applies on entry only, so a rep's later
  // override sticks.
  Object.assign(updates, stageEntryPatch(stage));

  const { data: deal, error } = await companyOs
    .from("deals")
    .update(updates)
    .eq("id", dealId)
    // The USD figure and the close stamp come back with the row because the win
    // is announced from them, as the database left them (S.2).
    .select("person_id, company_id, amount_usd_cents, closed_at, owner_id, title")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  let leadFailure: Result | null = null;
  if (deal?.person_id) {
    const synced = await syncLead(dealId, deal.person_id, from, to);
    if (!synced.ok) leadFailure = synced;
  }
  // The deal's own account becomes a customer whatever the person's links say
  // (raise-only, so idempotent).
  if (to === "won" && deal?.company_id) {
    await bumpCompanyLifecycle(deal.company_id, "customer", { reason: "deal_won" });
  }
  // Gated on the transition, not the state: a deal moved between two won stages
  // was won once. Last, because the fact is for entities above crm and a
  // subscriber failing cannot fail the move (ADR-0003).
  if (becomesWon(stage, ctx.deal.stageId, ctx.stages)) {
    await announceDealWon(
      deal
        ? {
            id: dealId,
            company_id: deal.company_id ?? null,
            person_id: deal.person_id ?? null,
            amount_usd_cents: (deal.amount_usd_cents as number | null) ?? null,
            closed_at: (deal.closed_at as string | null) ?? null,
            owner_id: deal.owner_id ?? null,
            title: deal.title,
          }
        : null,
      mover.personId,
    );
  }
  return leadFailure ?? { ok: true };
}

async function syncLead(dealId: string, personId: string, from: Kind, to: Kind): Promise<Result> {
  if (from === to) return { ok: true };
  const lookup = await getLead(personId);
  if (!lookup.ok) return { ok: false, error: `Deal stage saved, but the lead sync failed: ${lookup.error}` };
  const lead = lookup.lead;

  let otherLiveDeals = 0;
  let isCustomer = false;
  if (to === "open") {
    // A reopen gives nobody a lead row who is already a customer.
    const { count, error } = await companyOs
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .eq("status", "won")
      .is("archived_at", null)
      .neq("id", dealId);
    if (error) return { ok: false, error: `Deal stage saved, but the lead sync failed: ${error.message}` };
    isCustomer = (count ?? 0) > 0;
  }
  if (to === "lost") {
    // A failed count is not "no other deals": demoting the person to nurture on
    // that basis would undo a live pipeline, so the caller is told instead. An
    // archived deal is not live.
    const { count, error } = await companyOs
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("person_id", personId)
      .in("status", ["open", "won"])
      .is("archived_at", null)
      .neq("id", dealId);
    if (error) return { ok: false, error: `Deal stage saved, but the lead sync failed: ${error.message}` };
    otherLiveDeals = count ?? 0;
  }

  if (to === "won") await bumpPersonCompanies(personId, "customer", { reason: "deal_won" });

  const action = leadConsequence({ from, to, hasLead: lead !== null, leadStatus: lead?.status ?? null, otherLiveDeals, isCustomer });
  if (action === "none") return { ok: true };

  if (action === "retire") {
    const { error } = await companyOs.from("lead").delete().eq("person_id", personId);
    if (error) return { ok: false, error: `Deal stage saved, but retiring the lead failed: ${error.message}` };
    await recordTransition({ personId, fromStatus: lead?.status ?? null, toStatus: null, reason: "deal_won" });
    return { ok: true };
  }

  const row: CompanyOsInsert<"lead"> = {
    person_id: personId,
    status: action,
    sla_due_at: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await companyOs.from("lead").upsert(row, { onConflict: "person_id" });
  if (error) return { ok: false, error: `Deal stage saved, but the lead sync failed: ${error.message}` };
  await recordTransition({
    personId,
    fromStatus: lead?.status ?? null,
    toStatus: action,
    reason: action === "nurture" ? "deal_lost" : "deal_reopened",
  });
  return { ok: true };
}

/**
 * Set a deal aside: archived (kept, reversible, off the board and the
 * forecast) and the person back in the SDR queue at connected, since a deal
 * means a real conversation already happened. Not a loss, so it never reaches
 * the win rate. Two callers: a closer rejecting a handoff (CONTEXT.md, Handoff)
 * and a deal demoted to a lead. `extra` is written in the same update, which is
 * how the handoff records its answer.
 */
export async function setDealAside(input: {
  dealId: string;
  personId: string;
  mover: Mover;
  transitionReason: string;
  note: string | null;
  clearDisqualifiedReason: boolean;
  extra?: CompanyOsUpdate<"deals">;
}): Promise<Result> {
  // The lead first, the archive second: a failure in between leaves the deal as
  // it was (a pending handoff is still pending), so the person can simply try
  // again. The other order left a decided handoff whose lead never moved, and
  // no way back to it.
  const reopened = await reopenLeadAsConnected({
    personId: input.personId,
    clearDisqualifiedReason: input.clearDisqualifiedReason,
    transitionReason: input.transitionReason,
    note: input.note,
  });
  if (!reopened.ok) return reopened;
  const { error } = await companyOs
    .from("deals")
    .update({ ...(input.extra ?? {}), archived_at: new Date().toISOString(), archived_by: input.mover.email })
    .eq("id", input.dealId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// The person back in the SDR queue at connected, with the transition recorded.
async function reopenLeadAsConnected(input: {
  personId: string;
  clearDisqualifiedReason: boolean;
  transitionReason: string;
  note: string | null;
}): Promise<Result> {
  const lookup = await getLead(input.personId);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  const row: CompanyOsInsert<"lead"> = {
    person_id: input.personId,
    status: "connected",
    sla_due_at: null,
    ...(input.clearDisqualifiedReason ? { disqualified_reason: null } : {}),
    updated_at: new Date().toISOString(),
  };
  const { error } = await companyOs.from("lead").upsert(row, { onConflict: "person_id" });
  if (error) return { ok: false, error: error.message };
  await recordTransition({
    personId: input.personId,
    fromStatus: lookup.lead?.status ?? null,
    toStatus: "connected",
    reason: input.transitionReason,
    note: input.note,
  });
  return { ok: true };
}
