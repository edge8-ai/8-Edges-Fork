"use server";

import { upsertPersonQualifications } from "@/entities/org";
import { revalidatePath } from "next/cache";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { requirePermission } from "@/kernel/identity/access-request";
import {
  bumpPersonCompanies,
  getLead,
  promotePersonToLead,
  recordTransition,
} from "@/entities/crm/lib/lifecycle";
import { recordAudit } from "@/kernel/audit/audit";
import { guardedDelete } from "@/entities/crm/lib/mutations";
import { insertInteractions } from "@/kernel/messaging/writes";
import { createDeal } from "@/entities/crm/lib/deal-stage";
import type { Result } from "@/kernel/data/result";

const DISQUALIFY_REASONS = new Set([
  "no_budget",
  "no_need",
  "bad_timing",
  "no_authority",
  "unresponsive",
  "competitor",
  "not_icp",
  "other",
]);

function refresh() {
  revalidateSurfaces("/revenue/leads");
  revalidatePath("/admin/contacts");
}

export async function promoteLead(personId: string): Promise<Result> {
  await requirePermission("crm.pipeline");
  const r = await promotePersonToLead(personId, { reason: "promoted_manually" });
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

// Safe exit: take the person off the SDR queue (into nurture) without erasing
// anything. The person stays on /admin/contacts. Distinct from Delete person.
export async function removeFromQueue(personId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not in the queue." };

  const { error } = await companyOs.from("lead").update({ status: "nurture", sla_due_at: null, updated_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: "nurture",
    reason: "removed_from_queue",
  });
  await recordAudit({
    table: "lead",
    recordId: personId,
    operation: "update",
    actor: admin.email,
    context: { action: "removed_from_queue" },
  });
  refresh();
  return { ok: true };
}

// Destructive: permanently erase the person (GDPR), guarded by the schema's
// foreign keys. The lead row follows via ON DELETE CASCADE. Clearly separated
// from the safe "remove from queue".
export async function deleteLeadPerson(personId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");
  const r = await guardedDelete("people", personId, admin.email, { via: "leads" });
  if (r.ok) refresh();
  return r;
}

// Log an SDR call attempt: an interactions row + attempt counter. First
// attempt clears the speed-to-lead SLA and moves new → attempting.
export async function logCall(personId: string, note: string): Promise<Result> {
  await requirePermission("crm.pipeline");

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error: iErr } = await insertInteractions({
    kind: "call",
    subject: "SDR call attempt",
    body: note || null,
    person_id: personId,
    occurred_at: new Date().toISOString(),
    metadata: { source: "leads_queue" },
  });
  if (iErr) return { ok: false, error: iErr.message };

  const updates: CompanyOsUpdate<"lead"> = {
    attempt_count: (lead.attempt_count ?? 0) + 1,
    sla_due_at: null,
    updated_at: new Date().toISOString(),
  };
  if (lead.status === "new") updates.status = "attempting";

  const { error: uErr } = await companyOs.from("lead").update(updates).eq("person_id", personId);
  if (uErr) return { ok: false, error: uErr.message };

  if (lead.status === "new") {
    await recordTransition({
      personId,
      fromStatus: "new",
      toStatus: "attempting",
      reason: "call_logged",
    });
  }
  refresh();
  return { ok: true };
}

// Manual boost above the SLA-ordered queue — for a lead that needs working
// now regardless of where SLA/age would otherwise place it. SLA still governs
// order among pinned leads' unpinned peers and among each other's ties.
export async function pinLead(personId: string): Promise<Result> {
  await requirePermission("crm.pipeline");

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error } = await companyOs.from("lead").update({ pinned_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function unpinLead(personId: string): Promise<Result> {
  await requirePermission("crm.pipeline");

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error } = await companyOs.from("lead").update({ pinned_at: null }).eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

export async function markConnected(personId: string): Promise<Result> {
  await requirePermission("crm.pipeline");

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not an active lead." };
  if (lead.status === "connected") return { ok: true };

  const { error } = await companyOs.from("lead").update({ status: "connected", sla_due_at: null, updated_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: "connected",
    reason: "connected",
  });
  refresh();
  return { ok: true };
}

export async function saveQualification(
  personId: string,
  fields: {
    goal: string;
    plan: string;
    challenge: string;
    timeline: string;
    budget: string;
    authority: string;
  },
): Promise<Result> {
  await requirePermission("crm.pipeline");

  const clean = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v.trim() || null]),
  );
  // person_qualifications is company-os's table, so the write goes through the
  // writer it exports rather than a raw cross-entity insert.
  const { error } = await upsertPersonQualifications(
    { person_id: personId, ...clean },
    { onConflict: "person_id" },
  );
  if (error) return { ok: false, error: error.message };

  refresh();
  return { ok: true };
}

// Enumerated exit. mode 'nurture' keeps the person warm for re-engagement;
// 'unqualified' is a hard no. Either way the lead row stays and the transition
// log keeps this cycle queryable.
export async function disqualifyLead(
  personId: string,
  reason: string,
  mode: "unqualified" | "nurture",
  note: string,
): Promise<Result> {
  await requirePermission("crm.pipeline");
  if (!DISQUALIFY_REASONS.has(reason)) return { ok: false, error: "Pick a reason." };

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not an active lead." };

  const { error } = await companyOs.from("lead").update({
      status: mode,
      sla_due_at: null,
      disqualified_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("person_id", personId);
  if (error) return { ok: false, error: error.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: mode,
    reason,
    note: note.trim() || null,
  });
  refresh();
  return { ok: true };
}

// The SDR→closer handoff: create a pending deal on the default pipeline's
// first stage, move the lead to open_deal, and raise the account to
// opportunity. The closer accepts or rejects it on the Deals board.
export async function bookMeetingAndHandOff(personId: string): Promise<Result> {
  const { user: admin } = await requirePermission("crm.pipeline");

  const { data: person, error: pErr } = await companyOs
    .from("people")
    .select(`${NAME_COLUMNS}, person_companies(company_id, companies(name))`)
    .eq("id", personId)
    .maybeSingle();
  if (pErr || !person) return { ok: false, error: pErr?.message ?? "Person not found." };

  const leadLookup = await getLead(personId);

  if (!leadLookup.ok) return { ok: false, error: leadLookup.error };

  const lead = leadLookup.lead;
  if (!lead) return { ok: false, error: "Not an active lead." };
  // A lead already handed off has a pending deal on the board. A second call —
  // a double-click, a retried request, a second tab — must not create another.
  if (lead.status === "open_deal") return { ok: false, error: "This lead has already been handed off." };

  const { data: pipeline, error: plErr } = await companyOs.from("pipelines").select("id, pipeline_stages(id, position)")
    .eq("active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (plErr || !pipeline) return { ok: false, error: plErr?.message ?? "No active pipeline." };

  const stages = (pipeline.pipeline_stages ?? []) as { id: string; position: number }[];
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];
  if (!firstStage) return { ok: false, error: "Pipeline has no stages." };

  const pcs = (person.person_companies ?? []) as {
    company_id: string;
    companies: { name: string | null } | { name: string | null }[] | null;
  }[];
  const companyId = pcs[0]?.company_id ?? null;

  // New deals land at the bottom of the destination stage's priority order —
  // the closer can drag it up from there.
  const { count: stageDealCount, error: stageCountErr } = await companyOs.from("deals").select("id", { count: "exact", head: true })
    .eq("stage_id", firstStage.id);
  if (stageCountErr) return { ok: false, error: stageCountErr.message };

  const name = personName(person);
  // createDeal writes the stage log's first row itself (lib/deal-stage.ts).
  const created = await createDeal(
    {
      title: `${name} — SDR handoff`,
      person_id: personId,
      company_id: companyId,
      pipeline_id: pipeline.id,
      stage_id: firstStage.id,
      position: stageDealCount ?? 0,
      source: "sdr_handoff",
      handoff_status: "pending",
    },
    { movedBy: admin.email, note: "SDR hand-off" },
  );
  if (!created.ok) return created;
  {
    // The inquiry that brought this person in is linked to the deal it
    // produced, at conversion time (RH-2). Only an inquiry still being worked
    // qualifies; a won or archived one is history.
    const { error: linkErr } = await companyOs.from("inquiries").update({ deal_id: created.id })
      .eq("person_id", personId)
      .is("deal_id", null)
      .in("status", ["new_lead", "contacted", "qualified"]);
    if (linkErr) console.error("[crm] inquiries link", linkErr);
  }

  const { error: uErr } = await companyOs.from("lead").update({ status: "open_deal", sla_due_at: null, updated_at: new Date().toISOString() })
    .eq("person_id", personId);
  if (uErr) return { ok: false, error: uErr.message };

  await recordTransition({
    personId,
    fromStatus: lead.status,
    toStatus: "open_deal",
    reason: "meeting_booked",
  });
  await bumpPersonCompanies(personId, "opportunity", { reason: "meeting_booked" });

  refresh();
  revalidateSurfaces("/revenue/deals");
  return { ok: true };
}
