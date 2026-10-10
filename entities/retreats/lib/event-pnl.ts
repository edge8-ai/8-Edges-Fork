// Server-only data layer for the retreat P&L tab (company_os.event_pnl_lines).
// Authorization is the caller's job — every server action wraps these with
// requireAdmin(). Money is integer cents (major x 100) in the native currency;
// *_usd_cents is derived via fx_rates so revenue and expenses sum in one
// currency. Staff lines use a flat $150/day so real wages never leak to ops.
//
// Pure types/constants/totals live in ./event-pnl-shared (client-safe) and are
// re-exported here so server callers keep a single import.

import { companyOs } from "@/kernel/data/supabase";
import { upsertFxRates } from "@/entities/finance";
import { convertToUsdCents } from "@/kernel/data/fx";
import type { PnlLine, PnlLineInput } from "./event-pnl-shared";

export * from "./event-pnl-shared";

type Row = {
  id: string;
  event_id: string;
  side: PnlLine["side"];
  classification: string;
  description: string | null;
  person_id: string | null;
  attendees: number | null;
  staff_days: number | string | null;
  estimated_cents: number | string | null;
  estimated_currency: string | null;
  estimated_usd_cents: number | string | null;
  actual_cents: number | string | null;
  actual_currency: string | null;
  actual_usd_cents: number | string | null;
  payment_status: PnlLine["paymentStatus"];
  note: string | null;
  sort_order: number;
};

const num = (v: number | string | null): number | null =>
  v === null || v === "" ? null : Number(v);

function mapRow(r: Row): PnlLine {
  return {
    id: r.id,
    eventId: r.event_id,
    side: r.side,
    classification: r.classification,
    description: r.description,
    personId: r.person_id,
    attendees: r.attendees,
    staffDays: num(r.staff_days),
    estimatedCents: num(r.estimated_cents),
    estimatedCurrency: r.estimated_currency,
    estimatedUsdCents: num(r.estimated_usd_cents),
    actualCents: num(r.actual_cents),
    actualCurrency: r.actual_currency,
    actualUsdCents: num(r.actual_usd_cents),
    paymentStatus: r.payment_status,
    note: r.note,
    sortOrder: r.sort_order,
  };
}

export async function getEventPnlLines(eventId: string): Promise<PnlLine[]> {
  const { data, error } = await companyOs
    .from("event_pnl_lines")
    .select("*")
    .eq("event_id", eventId)
    .order("side", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getEventPnlLines failed:", error.message);
    return [];
  }
  return (data as Row[]).map(mapRow);
}

// Best-effort native -> USD. USD short-circuits (rate 1). On a flaky FX lookup
// we keep the native amount and leave USD null rather than block the save; the
// fx_rates cache is refreshed opportunistically so cross-currency sums stay
// close. Never throws.
async function deriveUsdCents(cents: number | null, currency: string | null): Promise<number | null> {
  if (cents === null) return null;
  const cur = (currency ?? "usd").toLowerCase();
  try {
    const fx = await convertToUsdCents(cents, cur);
    if (cur !== "usd") {
      await upsertFxRates(
          { currency: cur, rate_to_usd: fx.rate, updated_at: new Date().toISOString() },
          { onConflict: "currency" },
        );
    }
    return fx.amountUsdCents;
  } catch (err) {
    console.error("deriveUsdCents failed:", (err as Error).message);
    return cur === "usd" ? cents : null;
  }
}

function normalizeInput(input: PnlLineInput) {
  return {
    side: input.side,
    classification: input.classification,
    description: input.description ?? null,
    person_id: input.personId ?? null,
    attendees: input.attendees ?? null,
    staff_days: input.staffDays ?? null,
    estimated_cents: input.estimatedCents ?? null,
    estimated_currency: input.estimatedCents == null ? null : (input.estimatedCurrency ?? "usd").toLowerCase(),
    actual_cents: input.actualCents ?? null,
    actual_currency: input.actualCents == null ? null : (input.actualCurrency ?? "usd").toLowerCase(),
    payment_status: input.paymentStatus ?? "unpaid",
    note: input.note ?? null,
    sort_order: input.sortOrder ?? 0,
  };
}

export async function insertPnlLine(
  eventId: string,
  input: PnlLineInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const base = normalizeInput(input);
  const [estimatedUsd, actualUsd] = await Promise.all([
    deriveUsdCents(base.estimated_cents, base.estimated_currency),
    deriveUsdCents(base.actual_cents, base.actual_currency),
  ]);
  const { data, error } = await companyOs
    .from("event_pnl_lines")
    .insert({
      event_id: eventId,
      ...base,
      estimated_usd_cents: estimatedUsd,
      actual_usd_cents: actualUsd,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id: string }).id };
}

export async function updatePnlLine(
  id: string,
  input: PnlLineInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = normalizeInput(input);
  const [estimatedUsd, actualUsd] = await Promise.all([
    deriveUsdCents(base.estimated_cents, base.estimated_currency),
    deriveUsdCents(base.actual_cents, base.actual_currency),
  ]);
  const { error } = await companyOs
    .from("event_pnl_lines")
    .update({ ...base, estimated_usd_cents: estimatedUsd, actual_usd_cents: actualUsd })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deletePnlLine(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await companyOs.from("event_pnl_lines").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
