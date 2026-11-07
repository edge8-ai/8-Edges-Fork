// The monthly P&L mirrored from QuickBooks (company_os.pnl_monthly_lines):
// the writes the QuickBooks sync makes and the read the P&L page makes
// (ADR 0018: the door hands out commands and questions, never the table).
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";
import type { Result } from "@/kernel/data/result";
import { mustPages } from "@/kernel/data/read";
import type { PnlLine } from "./pnl-statement";

type PnlLineInsert = TablesInsert<{ schema: "company_os" }, "pnl_monthly_lines">;
export type PnlEntity = "edge8" | "aio";

// PostgREST takes one upsert in one request; a few thousand rows of a few
// short columns each stay well inside its body limit at this size.
const UPSERT_CHUNK = 500;

/** Writes the sync's pass over the P&L, keyed on (entity, month, external_id). */
export async function mirrorPnlLines(rows: PnlLineInsert[]): Promise<Result> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const { error } = await companyOs
      .from("pnl_monthly_lines")
      .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "entity,month,external_id" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Every stored line of one company from a month on, in report order. The sync
 * reads it to zero an account that left the report, and the P&L page reads it
 * to draw the statement. A failed read raises: an empty statement would read as
 * a month with no income and no costs.
 */
export async function pnlLinesSince(entity: PnlEntity, fromMonth: string): Promise<PnlLine[]> {
  const rows = await mustPages<{
    month: string;
    section: PnlLine["section"];
    external_id: string;
    parent_external_id: string | null;
    account_name: string;
    position: number;
    amount_cents: number;
  }>("pnl_monthly_lines", (from, to) =>
    companyOs
      .from("pnl_monthly_lines")
      .select("month, section, external_id, parent_external_id, account_name, position, amount_cents")
      .eq("entity", entity)
      .gte("month", fromMonth)
      .order("month")
      .order("position")
      .order("external_id")
      .range(from, to),
  );
  return rows.map((r) => ({
    month: r.month,
    section: r.section,
    externalId: r.external_id,
    parentExternalId: r.parent_external_id,
    accountName: r.account_name,
    position: r.position,
    amountCents: Number(r.amount_cents),
  }));
}

/** When the sync last wrote any line of this company, or null before the first sync. */
export async function pnlLastSyncedAt(entity: PnlEntity): Promise<string | null> {
  const { data, error } = await companyOs
    .from("pnl_monthly_lines")
    .select("synced_at")
    .eq("entity", entity)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`pnl_monthly_lines: ${error.message}`);
  return data?.synced_at ?? null;
}
