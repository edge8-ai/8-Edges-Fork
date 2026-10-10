import { recordAudit } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import type { Result } from "@/kernel/data/result";
import { formatCents } from "@/kernel/ui/format";
import { createDeal } from "./deal-stage";
import { bumpCompanyLifecycle } from "./lifecycle";
import { proposalVersion } from "./proposal-approval";
import { appliedOf, json, loadDraft, patchOf, updateDraft, type CrmApplied, type CrmPatch } from "./proposal-data";
import type { CrmPatchPart } from "./proposal-types";
import { updateDeals } from "./writes";

// The CRM changes a sales call implies (Z.10, decision 4): proposed by the
// chain, written only when a person ticks them and presses Apply. The chain
// never writes the CRM on its own and never creates a person or a company:
// identity rows are critical rows, and a transcript is speech recognition that
// garbles names. Someone named on the call who is not in the CRM is reported,
// never added. An applied part is recorded on the draft and not offered again.
// The changes record the call, not the proposal, so they stay if the proposal
// is rejected.

export type PatchState = {
  companyName: string;
  lifecycleStage: string | null;
  deal: { id: string; title: string; amountCents: number | null; currency: string | null; expectedCloseDate: string | null; nextStep: string | null; nextStepDate: string | null } | null;
  /** Whether the meeting is already linked to that deal. */
  meetingLinked: boolean;
  knownPeople: { name: string; email: string | null }[];
};

export type PatchFacts = {
  expectedCloseDate: string | null;
  nextStep: { text: string; date: string | null } | null;
  decisionMakers: { name: string; email: string | null }[];
};

const LIFECYCLE_ORDER = ["none", "subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (v: string | null | undefined): string | null => (v && ISO_DATE.test(v) ? v : null);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, " ").trim();

/**
 * The parts, from the facts and the CRM as it is. Pure. `amount` is the
 * proposal's total once it is drafted, null before.
 */
export function buildCrmPatch(facts: PatchFacts, state: PatchState, amount: { cents: number; currency: string } | null): CrmPatch {
  const parts: CrmPatchPart[] = [];
  const close = date(facts.expectedCloseDate);
  const nextStep = facts.nextStep?.text.trim() || null;
  const nextDate = date(facts.nextStep?.date);
  const dealTitle = state.deal?.title ?? `${state.companyName} - proposal`;

  if (state.deal) {
    const changes: string[] = [];
    if (amount && (amount.cents !== state.deal.amountCents || amount.currency !== state.deal.currency)) changes.push(`amount ${formatCents(amount.cents, amount.currency)}`);
    if (close && close !== state.deal.expectedCloseDate) changes.push(`expected close ${close}`);
    if (nextStep && nextStep !== state.deal.nextStep) changes.push(`next step "${nextStep}"${nextDate ? ` on ${nextDate}` : ""}`);
    if (changes.length > 0) parts.push({ id: "deal-fields", what: `Deal "${state.deal.title}"`, change: changes.join("; "), defaultOn: true, applicable: true });
  } else {
    const bits = ["at Discovery"];
    if (amount) bits.push(formatCents(amount.cents, amount.currency));
    if (close) bits.push(`expected close ${close}`);
    parts.push({ id: "deal-create", what: `New deal "${dealTitle}"`, change: bits.join(", "), defaultOn: true, applicable: true });
  }
  if (!state.meetingLinked) parts.push({ id: "meeting-deal", what: "This call", change: "linked to the deal", defaultOn: true, applicable: true });

  const rank = LIFECYCLE_ORDER.indexOf(state.lifecycleStage ?? "none");
  if (rank < LIFECYCLE_ORDER.indexOf("opportunity")) {
    parts.push({ id: "lifecycle", what: `Company ${state.companyName}`, change: `${state.lifecycleStage ?? "none"} to opportunity, with a dated transition`, defaultOn: true, applicable: true });
  }

  const known = state.knownPeople;
  facts.decisionMakers.forEach((p, i) => {
    const byEmail = p.email && known.some((k) => k.email && k.email.toLowerCase() === p.email?.toLowerCase());
    const byName = known.some((k) => norm(k.name) === norm(p.name));
    if (byEmail || byName) return;
    parts.push({
      id: `contact-${i}`,
      what: `New contact: ${p.name}`,
      change: "Not in the CRM. Named on the call; check the spelling, then add them on the company page.",
      defaultOn: false,
      applicable: false,
    });
  });

  return {
    parts,
    context: {
      dealTitle,
      amountCents: amount?.cents ?? null,
      currency: amount?.currency ?? null,
      expectedCloseDate: close,
      nextStep,
      nextStepDate: nextDate,
    },
  };
}

// The order parts are applied in: the deal first, because the link names it.
const APPLY_ORDER = ["deal-create", "deal-fields", "meeting-deal", "lifecycle"];

async function salesDiscoveryStage(): Promise<{ pipelineId: string; stageId: string }> {
  const pipelines = mustRows(
    await companyOs.from("pipelines").select("id, kind, active, created_at").eq("kind", "sales").eq("active", true).order("created_at", { ascending: true }).limit(1),
    "[crm/proposal] sales pipeline",
  ) as { id: string }[];
  if (pipelines.length === 0) throw new Error("There is no active sales pipeline to create the deal in.");
  const stages = mustRows(
    await companyOs.from("pipeline_stages").select("id, name").eq("pipeline_id", pipelines[0].id).eq("name", "Discovery").limit(1),
    "[crm/proposal] Discovery stage",
  ) as { id: string }[];
  if (stages.length === 0) throw new Error("The sales pipeline has no Discovery stage.");
  return { pipelineId: pipelines[0].id, stageId: stages[0].id };
}

export type ApplyOutcome = Result & { applied?: string[]; dealId?: string | null; dealChanged?: boolean };

/**
 * Apply the ticked parts that are applicable and not yet applied. Each part is
 * recorded as it lands, so a failure part-way keeps what was written and says
 * which part failed; the same click again applies the rest.
 */
export async function applyCrmPatch(draftId: string, picked: string[], by: { email: string }): Promise<ApplyOutcome> {
  const row = await loadDraft(draftId);
  if (!row) return { ok: false, error: "Proposal not found." };
  const patch = patchOf(row);
  if (!patch) return { ok: false, error: "This proposal proposes no CRM changes yet." };
  const applied: CrmApplied = { ...appliedOf(row) };
  const byId = new Map(patch.parts.map((p) => [p.id, p]));
  const todo = APPLY_ORDER.filter((id) => picked.includes(id) && byId.get(id)?.applicable && !applied[id]);
  if (todo.length === 0) return { ok: false, error: "Nothing to apply: tick a change that is not applied yet." };

  let dealId = row.deal_id;
  const done: string[] = [];
  const stamp = () => new Date().toISOString();
  const ctx = patch.context;
  for (const id of todo) {
    try {
      if (id === "deal-create") {
        if (dealId) {
          applied[id] = { at: stamp(), by: by.email, result: "a deal was already chosen" };
        } else {
          const { pipelineId, stageId } = await salesDiscoveryStage();
          const created = await createDeal(
            {
              pipeline_id: pipelineId,
              stage_id: stageId,
              title: ctx.dealTitle ?? "Proposal",
              company_id: row.company_id,
              amount_cents: ctx.amountCents ?? 0,
              ...(ctx.currency ? { currency: ctx.currency } : {}),
              expected_close_date: ctx.expectedCloseDate,
              next_step: ctx.nextStep,
              next_step_date: ctx.nextStepDate,
              source: "proposal-chain",
            },
            { movedBy: by.email, note: "Created from a sales call by the proposal chain" },
          );
          if (!created.ok) throw new Error(created.error);
          dealId = created.id;
          // The deal is part of the version an approval names, so the row's
          // stored version moves with it.
          await updateDraft(draftId, { deal_id: dealId, ...(row.version ? { version: proposalVersion({ ...row, deal_id: dealId }) } : {}) });
          applied[id] = { at: stamp(), by: by.email, result: dealId };
          await recordAudit({ table: "deals", recordId: dealId, operation: "insert", actor: by.email, context: { source: "proposal-chain", draft: draftId } });
        }
      } else if (id === "deal-fields") {
        if (!dealId) throw new Error("There is no deal to update.");
        const update: Record<string, unknown> = { updated_at: stamp() };
        if (ctx.amountCents !== null) update.amount_cents = ctx.amountCents;
        if (ctx.currency) update.currency = ctx.currency;
        if (ctx.expectedCloseDate) update.expected_close_date = ctx.expectedCloseDate;
        if (ctx.nextStep) update.next_step = ctx.nextStep;
        if (ctx.nextStepDate) update.next_step_date = ctx.nextStepDate;
        const { error } = await updateDeals(update).eq("id", dealId);
        if (error) throw new Error(error.message);
        applied[id] = { at: stamp(), by: by.email };
        await recordAudit({ table: "deals", recordId: dealId, operation: "update", actor: by.email, context: { source: "proposal-chain", draft: draftId, fields: Object.keys(update) } });
      } else if (id === "meeting-deal") {
        if (!dealId || !row.meeting_id) throw new Error("There is no deal or no meeting to link.");
        const { error } = await companyOs.from("meeting_associations").insert({ meeting_id: row.meeting_id, entity_type: "deal", entity_id: dealId });
        // Already linked (the unique key) is the change already made.
        if (error && error.code !== "23505") throw new Error(error.message);
        applied[id] = { at: stamp(), by: by.email };
        await recordAudit({ table: "meeting_associations", recordId: row.meeting_id, operation: "insert", actor: by.email, context: { deal: dealId, draft: draftId } });
      } else if (id === "lifecycle") {
        await bumpCompanyLifecycle(row.company_id, "opportunity", { reason: "proposal_call", changedBy: by.email });
        applied[id] = { at: stamp(), by: by.email };
        await recordAudit({ table: "companies", recordId: row.company_id, operation: "update", actor: by.email, context: { lifecycle: "opportunity", draft: draftId } });
      }
      done.push(id);
    } catch (err) {
      await updateDraft(draftId, { crm_applied: json(applied) });
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `${done.length ? `Applied ${done.join(", ")}; then ` : ""}"${byId.get(id)?.what}" failed: ${message}`, applied: done, dealId, dealChanged: dealId !== row.deal_id };
    }
  }
  await updateDraft(draftId, { crm_applied: json(applied) });
  return { ok: true, applied: done, dealId, dealChanged: dealId !== row.deal_id };
}
