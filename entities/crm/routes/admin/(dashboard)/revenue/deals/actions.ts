"use server";

import { personIdForEmailOrNull } from "@/kernel/identity/person-by-email";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs, companyOsUntyped, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { legalName } from "@/kernel/config/people-name";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { archiveRecord, guardedDelete, restoreRecord } from "@/entities/crm/lib/mutations";
import { insertPeople } from "@/kernel/identity/writes";
import { insertInteractions } from "@/kernel/messaging/writes";
import { parseLinkInput } from "@/kernel/ui/url";
import { stripPostgrestMetacharacters } from "@/kernel/data/postgrest-filter";
import { HANDOFF_REJECT_REASONS } from "./deal-helpers";
import { moveDealToStage, setDealAside } from "@/entities/crm/lib/deal-close";
import { clearedForecastInputs, forecastEditError, loadStageContext } from "@/entities/crm/lib/deal-stage";
import { refreshFxRate } from "@/entities/crm/lib/deal-fx";
import type { Result } from "@/kernel/data/result";

// Moving a deal into this stage (contract out, awaiting payment) auto-sets its
// forecast probability — the deal is effectively 90% sure by this point. It's the
// only stage that touches probability on entry; every other stage leaves it alone.

function refresh() {
  revalidateSurfaces("/revenue/deals");
  revalidateSurfaces("/revenue/leads");
}

// Move a deal to a pipeline stage: the board's drag and the detail page. The
// rules and every consequence of the move (the lead, the customer bump, the
// announcement of a win) are crm/lib/deal-close's; the database derives the
// status, the close stamp and the stage log from the stage (ADR-0011).
export async function moveDealStage(
  dealId: string,
  toStageId: string,
  lostReason?: string,
  wonAmount?: number,
): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const res = await moveDealToStage({
    dealId,
    toStageId,
    lostReason,
    wonAmount,
    mover: { email: admin.email, personId: await personIdForEmailOrNull(admin.email, "crm/deals") },
  });
  refresh();
  return res;
}

// Send an open deal back to being a lead — it was accepted or created
// prematurely and needs more qualification before it's worth a closer's time.
// Archives the deal (kept, reversible, out of the board/forecast — the same
// mechanism the manual Archive button uses) and reopens the person's lead row
// at 'connected', since a deal implies real contact already happened, so
// there's no fresh SLA clock to start.
export async function demoteDealToLead(dealId: string, reason: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const { data: deal, error: dErr } = await companyOs.from("deals").select("person_id, status, handoff_status, archived_at")
    .eq("id", dealId)
    .maybeSingle();
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? "Deal not found." };
  if (deal.archived_at) return { ok: false, error: "This deal is already archived." };
  if (deal.status !== "open") return { ok: false, error: "Only open deals can be demoted." };
  if (deal.handoff_status === "pending") {
    return { ok: false, error: "This deal is still a pending handoff — accept or reject it instead." };
  }
  if (!deal.person_id) return { ok: false, error: "This deal isn't linked to a contact." };

  const aside = await setDealAside({
    dealId,
    personId: deal.person_id,
    mover: { email: admin.email, personId: null },
    transitionReason: "demoted_from_deal",
    note: reason.trim() || null,
    clearDisqualifiedReason: true,
  });
  if (!aside.ok) return aside;

  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    context: { action: "demoted_to_lead", reason: reason.trim() || null },
  });

  refresh();
  return { ok: true };
}

// Rewrites `position` (0..n-1) for a full ordered set of deal ids — the new
// rank of a single stage/column after a drag. Called after the stage-change
// side effects (if any) so a rejected move never leaves positions dangling.
export async function reorderDeals(orderedIds: string[], stageId?: string): Promise<Result> {
  await requirePermission("crm.pipeline");
  if (orderedIds.length === 0) return { ok: true };

  // With the stage known the database renumbers the whole stage — the client's
  // order first, then deals it did not know about (R.4). Until migration
  // 20260912130100 lands the function is missing and the old renumber is used.
  if (stageId) {
    const { error: stageErr } = await companyOsUntyped.rpc("set_deal_positions_in_stage", {
      p_stage_id: stageId,
      p_ids: orderedIds,
    });
    if (!stageErr) {
      refresh();
      return { ok: true };
    }
    // PGRST202: no such function in the schema cache — the pre-migration case.
    const missing = stageErr.code === "PGRST202" || /does not exist|could not find/i.test(stageErr.message);
    if (!missing) return { ok: false, error: stageErr.message };
  }
  const { error } = await companyOs.rpc("set_deal_positions", { p_ids: orderedIds, p_start: 0 });
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

// The closer's side of the SDR handoff contract. Reject sends the person back
// to the SDR queue and closes the deal; the reason feeds SDR coaching.
export async function decideHandoff(
  dealId: string,
  decision: "accepted" | "rejected",
  reason?: string,
  note?: string,
): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  if (decision === "rejected" && (!reason || !HANDOFF_REJECT_REASONS.has(reason))) {
    return { ok: false, error: "Rejecting a handoff needs a reason." };
  }

  const { data: deal, error: dErr } = await companyOs.from("deals").select("person_id, handoff_status")
    .eq("id", dealId)
    .maybeSingle();
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? "Deal not found." };
  if (deal.handoff_status !== "pending") return { ok: false, error: "Handoff already decided." };

  const answer: CompanyOsUpdate<"deals"> = {
    handoff_status: decision,
    handoff_decided_at: new Date().toISOString(),
    handoff_note: note?.trim() || null,
  };

  // A rejection is not a loss (CONTEXT.md, Handoff): the closer declined to take
  // it on, which says nothing about whether the client would buy. The deal is
  // set aside, as a demotion is, and the person resumes in the SDR queue at
  // connected, since they had a real conversation. It stays out of the win rate.
  if (decision === "rejected") {
    if (!deal.person_id) {
      const { error } = await companyOs
        .from("deals")
        .update({ ...answer, handoff_rejected_reason: reason, archived_at: new Date().toISOString(), archived_by: admin.email })
        .eq("id", dealId);
      if (error) return { ok: false, error: error.message };
    } else {
      const aside = await setDealAside({
        dealId,
        personId: deal.person_id,
        mover: { email: admin.email, personId: null },
        transitionReason: "handoff_rejected",
        note: reason ?? null,
        clearDisqualifiedReason: false,
        extra: { ...answer, handoff_rejected_reason: reason },
      });
      if (!aside.ok) return aside;
    }
    refresh();
    return { ok: true };
  }

  const { error } = await companyOs.from("deals").update(answer).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// ─── Full deal edit ──────────────────────────────────────────────────────────
// `amount` is dollars from the form; it's the only place we convert to the
// integer-cents storage. Only keys present in the patch are written.
export type DealPatch = {
  title?: string;
  amount?: number | null;
  currency?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  source?: string | null;
  next_step?: string | null;
  next_step_date?: string | null;
  proposal_url?: string | null;
  contract_url?: string | null;
};

export async function updateDeal(dealId: string, patch: DealPatch): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const updates: CompanyOsUpdate<"deals"> = {};

  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title can't be empty." };
    updates.title = t;
  }
  if (patch.amount !== undefined) {
    const amt = patch.amount ?? 0;
    if (!Number.isFinite(amt) || amt < 0) return { ok: false, error: "Amount must be zero or more." };
    updates.amount_cents = Math.round(amt * 100);
  }
  if (patch.currency !== undefined) {
    const c = patch.currency.trim().toLowerCase();
    if (!c) return { ok: false, error: "Currency is required." };
    updates.currency = c;
  }
  if (patch.probability !== undefined) {
    if (patch.probability == null) updates.probability = null;
    else {
      const p = Math.round(patch.probability);
      if (p < 0 || p > 100) return { ok: false, error: "Probability must be between 0 and 100." };
      updates.probability = p;
    }
  }
  if (patch.expected_close_date !== undefined) updates.expected_close_date = patch.expected_close_date || null;
  if (patch.source !== undefined) updates.source = patch.source?.trim() || null;
  if (patch.next_step !== undefined) updates.next_step = patch.next_step?.trim() || null;
  if (patch.next_step_date !== undefined) updates.next_step_date = patch.next_step_date || null;
  for (const [key, label] of [["proposal_url", "Proposal"], ["contract_url", "Contract"]] as const) {
    if (patch[key] === undefined) continue;
    const link = parseLinkInput(patch[key]);
    if (!link.ok) return { ok: false, error: `${label} link isn't a web link. Paste the full address (e.g. a Google Doc URL).` };
    updates[key] = link.value;
  }

  // A deal at Proposal or later keeps its forecast inputs (R.23): the move gate
  // stops it entering without them, and this stops an edit taking them away.
  // The stage is read only when the edit clears one, so ordinary edits cost
  // nothing extra.
  if (clearedForecastInputs(updates).length > 0) {
    const ctx = await loadStageContext(dealId);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const gate = forecastEditError(ctx.stages, ctx.deal.stageId, updates);
    if (gate) return { ok: false, error: gate };
  }

  // The database derives the USD value when the amount or currency changes
  // (R.24); refreshing the cached rate first makes it today's. An amount-only
  // patch reads the currency back off the stored deal.
  if (updates.amount_cents !== undefined || updates.currency !== undefined) {
    let currency = updates.currency as string | undefined;
    if (currency === undefined) {
      const { data: existing, error: existingErr } = await companyOs.from("deals").select("currency").eq("id", dealId).maybeSingle();
      if (existingErr) return { ok: false, error: existingErr.message };
      currency = existing?.currency ?? "usd";
    }
    await refreshFxRate(currency);
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const { error } = await companyOs.from("deals").update(updates).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({ table: "deals", recordId: dealId, operation: "update", actor: admin.email, newData: updates });
  refresh();
  return { ok: true };
}

export async function archiveDeal(dealId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await archiveRecord("deals", dealId, admin.email);
  if (r.ok) refresh();
  return r;
}

export async function restoreDeal(dealId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await restoreRecord("deals", dealId, admin.email);
  if (r.ok) refresh();
  return r;
}

export async function deleteDeal(dealId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await guardedDelete("deals", dealId, admin.email, { via: "deals" });
  if (r.ok) refresh();
  return r;
}

// ─── Communications ──────────────────────────────────────────────────────────
// Deal communications live in the shared interactions activity log, scoped with
// subject_type='deal' + subject_id. We surface the manual entries (notes, calls,
// emails, meetings) and hide the automatic 'status_change' rows the pipeline
// writes on every stage move, so the list reads as a human conversation history.
export type Communication = {
  id: string;
  kind: string;
  subject: string | null;
  body: string | null;
  occurredAt: string | null;
};

const AUTO_INTERACTION_KINDS = ["status_change"];

export async function getDealCommunications(
  dealId: string,
): Promise<{ ok: true; items: Communication[] } | { ok: false; error: string }> {
  await requirePermission("crm.pipeline");

  const { data, error } = await companyOs
    .from("interactions")
    .select("id, kind, subject, body, occurred_at")
    .eq("subject_type", "deal")
    .eq("subject_id", dealId)
    .not("kind", "in", `(${AUTO_INTERACTION_KINDS.join(",")})`)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const items: Communication[] = (data ?? []).map((r) => ({
    id: r.id as string,
    kind: (r.kind as string) ?? "note",
    subject: (r.subject as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    occurredAt: (r.occurred_at as string | null) ?? null,
  }));
  return { ok: true, items };
}

export async function addDealCommunication(
  dealId: string,
  body: string,
): Promise<{ ok: true; item: Communication } | { ok: false; error: string }> {
  await requirePermission("crm.pipeline");

  const text = body.trim();
  if (!text) return { ok: false, error: "Write something before saving." };

  // Copy the deal's person/company onto the log entry so the note also lands on
  // the contact's 360 timeline (which filters interactions by person_id).
  const { data: deal, error: dErr } = await companyOs.from("deals").select("person_id, company_id")
    .eq("id", dealId)
    .maybeSingle();
  if (dErr || !deal) return { ok: false, error: dErr?.message ?? "Deal not found." };

  const occurredAt = new Date().toISOString();
  const { data, error } = await insertInteractions({
      kind: "note",
      body: text,
      person_id: deal.person_id,
      company_id: deal.company_id,
      subject_type: "deal",
      subject_id: dealId,
      occurred_at: occurredAt,
      metadata: { source: "deal_drawer" },
    })
    .select("id, kind, subject, body, occurred_at")
    .single();
  if (error) return { ok: false, error: error.message };

  refresh();
  return {
    ok: true,
    item: {
      id: data.id as string,
      kind: (data.kind as string) ?? "note",
      subject: (data.subject as string | null) ?? null,
      body: (data.body as string | null) ?? null,
      occurredAt: (data.occurred_at as string | null) ?? occurredAt,
    },
  };
}

// ─── Referrer ────────────────────────────────────────────────────────────────
// A deal credits one referrer, stored as a real people row via deals.referrer_id.
export type PersonHit = { id: string; name: string; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The name on record, because the search matches and orders by full_name
// (S.16): a hit must show the text that was typed.
function personHit(row: { id: string; full_name: string | null; email: string }): PersonHit {
  return { id: row.id, name: legalName(row), email: row.email };
}

// Typeahead for the referrer picker. Strips PostgREST filter metacharacters from
// the raw term so a stray comma or paren can't break (or inject into) the `or`.
export async function searchPeople(query: string): Promise<PersonHit[]> {
  await requirePermission("crm.pipeline");

  const term = stripPostgrestMetacharacters(query.trim());
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const { data, error } = await companyOs
    .from("people")
    .select("id, full_name, email")
    .is("archived_at", null)
    .or(`full_name.ilike.${like},email.ilike.${like}`)
    .order("full_name")
    .limit(8);
  if (error) { console.error(`[revenue/deals] searchPeople failed:`, error.message); return []; }
  return (data ?? []).map(personHit);
}

// Link an existing contact as the deal's referrer, or clear it with null.
export async function setDealReferrer(
  dealId: string,
  referrerId: string | null,
): Promise<{ ok: true; referrer: PersonHit | null } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.pipeline");

  let referrer: PersonHit | null = null;
  if (referrerId) {
    const { data: person, error: pErr } = await companyOs
      .from("people")
      .select("id, full_name, email")
      .eq("id", referrerId)
      .maybeSingle();
    if (pErr) return { ok: false, error: pErr.message };
    if (!person) return { ok: false, error: "That contact no longer exists." };
    referrer = personHit(person);
  }

  const { error } = await companyOs.from("deals").update({ referrer_id: referrerId }).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    newData: { referrer_id: referrerId },
  });
  refresh();
  return { ok: true, referrer };
}

// Create a brand-new contact (name + email) and link them as the referrer.
// Matches on email first so a referrer who is already in the CRM is reused
// rather than duplicated (people.email is a unique citext).
export async function createReferrerForDeal(
  dealId: string,
  name: string,
  email: string,
): Promise<{ ok: true; referrer: PersonHit; created: boolean } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const fullName = name.trim();
  const addr = email.trim();
  if (!fullName) return { ok: false, error: "Referrer name is required." };
  if (!EMAIL_RE.test(addr)) return { ok: false, error: "Enter a valid email." };

  const { data: existing, error: exErr } = await companyOs
    .from("people")
    .select("id, full_name, email")
    .eq("email", addr)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  let person = existing;
  let created = false;
  if (!person) {
    const { data: inserted, error: insErr } = await insertPeople({ full_name: fullName, email: addr, source: "referral" })
      .select("id, full_name, email")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    person = inserted;
    created = true;
    await recordAudit({
      table: "people",
      recordId: person.id,
      operation: "insert",
      actor: admin.email,
      newData: { full_name: fullName, email: addr, source: "referral" },
    });
  }

  const { error } = await companyOs.from("deals").update({ referrer_id: person.id }).eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    newData: { referrer_id: person.id },
  });

  refresh();
  return { ok: true, referrer: personHit(person), created };
}

// ─── Referring company ───────────────────────────────────────────────────────
// A deal can also credit a referring company directly, via deals.referrer_company_id.
// This is a separate field from the person referrer above — companies are picked,
// never created here.
export type CompanyHit = { id: string; name: string | null };

// Typeahead for the referring-company picker. Strips PostgREST filter
// metacharacters from the raw term exactly like searchPeople.
export async function searchCompanies(query: string): Promise<CompanyHit[]> {
  await requirePermission("crm.pipeline");

  const term = stripPostgrestMetacharacters(query.trim());
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const { data, error } = await companyOs
    .from("companies")
    .select("id, name")
    .is("archived_at", null)
    .ilike("name", like)
    .order("name")
    .limit(8);
  if (error) { console.error(`[revenue/deals] searchCompanies failed:`, error.message); return []; }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
}

// Link an existing company as the deal's referring company, or clear it with null.
export async function setDealReferrerCompany(
  dealId: string,
  referrerCompanyId: string | null,
): Promise<{ ok: true; referrerCompany: CompanyHit | null } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("crm.pipeline");

  let referrerCompany: CompanyHit | null = null;
  if (referrerCompanyId) {
    const { data: company, error: cErr } = await companyOs
      .from("companies")
      .select("id, name, archived_at")
      .eq("id", referrerCompanyId)
      .maybeSingle();
    if (cErr) return { ok: false, error: cErr.message };
    if (!company || company.archived_at) return { ok: false, error: "That company no longer exists." };
    referrerCompany = { id: company.id, name: company.name };
  }

  const { error } = await companyOs.from("deals").update({ referrer_company_id: referrerCompanyId })
    .eq("id", dealId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    table: "deals",
    recordId: dealId,
    operation: "update",
    actor: admin.email,
    newData: { referrer_company_id: referrerCompanyId },
  });
  refresh();
  return { ok: true, referrerCompany };
}
