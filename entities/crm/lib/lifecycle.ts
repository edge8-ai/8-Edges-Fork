import { companyOs } from "@/kernel/data/supabase";
import { publish, type EventPayload } from "@/kernel/events";
import { selectDeals, selectLead } from "./reads";
import { upsertLead, insertLifecycleTransitions } from "./writes";
import { updateCompanies } from "@/kernel/identity/writes";

import { selectPersonCompanies } from "@/entities/contacts";

// Lifecycle helpers for the sales model. Owned by crm since RS-04: the
// lead satellite, the companies row and lifecycle_transitions are all CRM
// tables, and the callers (the site's contact form and retreat signups, the
// retreats event actions, the admin inquiries and deals actions) sit on this
// layer or above it. The lead journey lives on the
// company_os.lead satellite — one row per person actively being worked as a
// lead — and lifecycle_stage is account-level on companies (B2B: the account
// advances while you talk to several of its contacts). Every change appends a
// row to company_os.lifecycle_transitions (person-scoped for status moves,
// company-scoped for stage moves) so funnel math and recycle history stay
// queryable. Server-only (companyOs uses the service key).

export type LifecycleStage =
  | "none"
  | "subscriber"
  | "lead"
  | "mql"
  | "sql"
  | "opportunity"
  | "customer"
  | "evangelist";

export type LeadStatus =
  | "new"
  | "attempting"
  | "connected"
  | "meeting_booked"
  | "open_deal"
  | "unqualified"
  | "nurture";

export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  "new",
  "attempting",
  "connected",
  "meeting_booked",
];

// Inbound SALES contact only. Event/commerce/legacy-import intake (retreat
// signups, checkout, newsletter, the one-off legacy 'general' bulk import)
// lives in orders/registrations, and none of it is demand the Revenue hub
// counts. Declared once because every screen that measures inbound demand has
// to exclude exactly the same set: three of them each held a copy, two of
// those as bare literals, so a sixth type meant finding all three or letting
// the Revenue hub's headline number disagree with the Inquiries board.
// A PostgREST `in` list, for `.not("type", "in", NON_SALES_INQUIRY_TYPES)`.
export const NON_SALES_INQUIRY_TYPES = "(general,retreat,trip,checkout,newsletter)";

// Stage order for raise-only company bumps: an account never moves backwards
// automatically (a new lead at a customer account doesn't demote the account).
const STAGE_RANK: Record<LifecycleStage, number> = {
  none: 0,
  subscriber: 1,
  lead: 2,
  mql: 3,
  sql: 4,
  opportunity: 5,
  customer: 6,
  evangelist: 7,
};

export type LeadRow = {
  person_id: string;
  status: LeadStatus;
  sla_due_at: string | null;
  attempt_count: number;
  disqualified_reason: string | null;
};

// "No such lead" and "the lookup failed" are different answers, and every
// caller used to hear the second as the first — a transient database error
// became "Not an active lead" on screen, with nothing to retry (R.5). The
// lookup now says which it was.
export type LeadLookup = { ok: true; lead: LeadRow | null } | { ok: false; error: string };

export async function getLead(personId: string): Promise<LeadLookup> {
  const { data, error: leadErr } = await selectLead("person_id, status, sla_due_at, attempt_count, disqualified_reason")
    .eq("person_id", personId)
    .maybeSingle();
  if (leadErr) return { ok: false, error: `lead lookup failed: ${leadErr.message}` };
  return { ok: true, lead: (data as LeadRow | null) ?? null };
}

type TransitionInput = {
  personId?: string | null;
  companyId?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  note?: string | null;
  changedBy?: string | null;
};

export async function recordTransition(t: TransitionInput): Promise<void> {
  const { error } = await insertLifecycleTransitions({
    person_id: t.personId ?? null,
    company_id: t.companyId ?? null,
    from_stage: t.fromStage ?? null,
    to_stage: t.toStage ?? null,
    from_status: t.fromStatus ?? null,
    to_status: t.toStatus ?? null,
    reason: t.reason ?? null,
    note: t.note ?? null,
    changed_by: t.changedBy ?? null,
  });
  if (error) console.error("lifecycle_transitions insert failed:", error.message);
}

// Raise a company's lifecycle_stage (never lowers it) and log the transition.
export async function bumpCompanyLifecycle(
  companyId: string,
  toStage: LifecycleStage,
  opts: { reason?: string; changedBy?: string | null } = {},
): Promise<void> {
  const { data: company, error: companyErr } = await companyOs
    .from("companies")
    .select("lifecycle_stage")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr) console.error("[company-os/lifecycle] companies", companyErr);
  if (!company) return;

  const current = (company.lifecycle_stage ?? "none") as LifecycleStage;
  if (STAGE_RANK[current] >= STAGE_RANK[toStage]) return;

  const { error } = await updateCompanies({ lifecycle_stage: toStage })
    .eq("id", companyId);
  if (error) {
    console.error("company lifecycle bump failed:", error.message);
    return;
  }
  await recordTransition({
    companyId,
    fromStage: current,
    toStage,
    reason: opts.reason ?? null,
    changedBy: opts.changedBy ?? null,
  });
}

// Bump every company the person is linked to. Best-effort: a person with no
// company links (solo lead) simply advances nothing at the account level.
export async function bumpPersonCompanies(
  personId: string,
  toStage: LifecycleStage,
  opts: { reason?: string; changedBy?: string | null } = {},
): Promise<void> {
  const { data, error: linksErr } = await selectPersonCompanies("company_id")
    .eq("person_id", personId);
  if (linksErr) console.error("[company-os/lifecycle] person_companies", linksErr);
  for (const link of (data ?? []) as { company_id: string }[]) {
    await bumpCompanyLifecycle(link.company_id, toStage, opts);
  }
}

// ---- the win, stated as a fact (S.2, docs/adr/0003) -------------------------
//
// Winning a deal is the moment selling stops and delivering starts, and the
// entities that care about delivery all sit ABOVE crm in the graph: boards
// requires crm, not the other way round, so crm may not call them. It states
// the fact and they subscribe.

/** The deal columns a win is announced from, as the row comes back. */
export type WonDeal = {
  id: string;
  company_id: string | null;
  person_id: string | null;
  amount_usd_cents: number | null;
  closed_at: string | null;
  // For the inbox (S.3): who owns the deal, and what it is called. Optional,
  // so a caller that did not read them still announces the win.
  owner_id?: string | null;
  title?: string | null;
};

/**
 * The fact a won deal states, or null when the row cannot support one.
 *
 * Pure, so the mapping is testable without a pipeline: every field a
 * subscriber may rely on is decided here rather than at the call site, and the
 * two shapes that cannot be announced — a row that came back empty, and a win
 * with no close stamp — are refused where a reader can see why.
 */
export function dealWonFact(row: WonDeal | null): EventPayload<"deal.won"> | null {
  if (!row?.id) return null;
  // Every won deal is stamped closed in the same update that wins it. A row
  // without the stamp is a half-written win, and dating it "now" in the
  // subscriber would put a made-up date on somebody's record.
  if (!row.closed_at) return null;
  const usd = row.amount_usd_cents;
  return {
    dealId: row.id,
    companyId: row.company_id,
    personId: row.person_id,
    // FX conversion is best-effort at the point of the win, so an unconverted
    // deal announces no amount rather than a figure in the wrong currency.
    amountUsdCents: typeof usd === "number" && Number.isInteger(usd) && usd >= 0 ? usd : null,
    closedAt: row.closed_at,
    ...(row.owner_id !== undefined ? { ownerId: row.owner_id } : {}),
    ...(row.title ? { title: row.title } : {}),
  };
}

/**
 * Does this stage move WIN the deal, as opposed to leaving it won?
 *
 * `deal.won` states a transition, not a state, and its two siblings already
 * say so: hiring reads the application row before the write because "re-saving
 * hired on somebody hired last month is not a second hire", and finance diffs
 * the mirror pass against the stored invoices. This is the same test for deals.
 * Without it, dragging a deal between two won stages — or re-saving the stage
 * it is already in — restates a win that happened once, and every subscriber
 * acts on it again.
 *
 * Pure, and it resolves the origin stage itself rather than taking a boolean,
 * because resolving it is the part that goes wrong: a deal may carry no stage
 * at all, and the stage it names may no longer be in the list.
 *
 * An origin that cannot be resolved counts as NOT won, so the win is announced.
 * That asymmetry is deliberate: a duplicate reaches idempotent subscribers,
 * while a swallowed win is a client's delivery board that silently never opens.
 */
export function becomesWon(
  toStage: { is_won: boolean },
  fromStageId: string | null,
  stages: readonly { id: string; is_won: boolean }[],
): boolean {
  if (!toStage.is_won) return false;
  const from = fromStageId ? stages.find((s) => s.id === fromStageId) : undefined;
  return !from?.is_won;
}

/**
 * Announce a win.
 *
 * Called after the deal row has been written, never before: the bus awaits its
 * handlers, so a subscriber acting on a win the database then refused would
 * have opened a client's delivery board for a deal that never closed.
 */
export async function announceDealWon(row: WonDeal | null, actorPersonId: string | null = null): Promise<void> {
  const fact = dealWonFact(row);
  if (!fact) return;
  // Who won it, so the inbox does not tell an owner about their own win (S.19.9).
  await publish("deal.won", actorPersonId ? { ...fact, actorPersonId } : fact);
}

export type PromoteResult =
  | { ok: true; promoted: boolean }
  | { ok: false; error: string };

// Promote a person into the SDR queue: upsert their lead row and raise their
// companies to 'lead'. Idempotent: someone already being worked, already handed
// off (open_deal), or already a customer (an open/won deal) is left alone, so
// double submits and repeat inquiries never demote anyone or duplicate
// transitions. `slaFrom` starts the SLA clock at that moment instead of now:
// the inquiry-to-lead chain files a lead a few minutes after the form was
// sent, and the visitor was promised an answer from the moment they sent it.
export async function promotePersonToLead(
  personId: string,
  opts: { slaHours?: number; reason?: string; changedBy?: string | null; slaFrom?: string } = {},
): Promise<PromoteResult> {
  const { data: person, error } = await companyOs
    .from("people")
    .select("id")
    .eq("id", personId)
    .maybeSingle();
  if (error || !person) return { ok: false, error: error?.message ?? "Person not found." };

  const lookup = await getLead(personId);
  if (!lookup.ok) return { ok: false, error: lookup.error };
  const lead = lookup.lead;
  if (lead && (ACTIVE_LEAD_STATUSES.includes(lead.status) || lead.status === "open_deal")) {
    return { ok: true, promoted: false };
  }

  // Customer guard, satellite-era: "is a customer" is derived from deals, not
  // from a person-level stage.
  // A failed read here used to count as "no deals", which promotes an existing
  // customer back to 'lead' — the one thing this function promises not to do
  // (A.12). The guard's permissive branch is the dangerous one, so the failure
  // is returned rather than defaulted.
  const { count: dealCount, error: dealCountError } = await selectDeals("id", { count: "exact", head: true })
    .eq("person_id", personId)
    .in("status", ["open", "won"])
    .is("archived_at", null);
  if (dealCountError) return { ok: false, error: dealCountError.message };
  if ((dealCount ?? 0) > 0) return { ok: true, promoted: false };

  const slaHours = opts.slaHours ?? 4;
  const from = opts.slaFrom ? Date.parse(opts.slaFrom) : NaN;
  const slaDueAt = new Date((Number.isFinite(from) ? from : Date.now()) + slaHours * 3600_000).toISOString();

  const { error: upErr } = await upsertLead(
    {
      person_id: personId,
      status: "new",
      sla_due_at: slaDueAt,
      disqualified_reason: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "person_id" },
  );
  if (upErr) return { ok: false, error: upErr.message };

  await recordTransition({
    personId,
    fromStatus: lead?.status ?? null,
    toStatus: "new",
    reason: opts.reason ?? "promoted",
    changedBy: opts.changedBy ?? null,
  });
  await bumpPersonCompanies(personId, "lead", {
    reason: opts.reason ?? "promoted",
    changedBy: opts.changedBy ?? null,
  });
  return { ok: true, promoted: true };
}
