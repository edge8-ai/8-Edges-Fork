import { mirrorPnlLines, pnlLinesSince } from "@/entities/finance";
import { saigonToday } from "@/kernel/config/dates";
import type { QboEntity } from "@/entities/company-os/lib/qbo";
import { fetchQboPnl } from "@/entities/company-os/lib/qbo-pnl";

// Mirrors one QuickBooks company's monthly P&L into
// company_os.pnl_monthly_lines: every account, every month from SINCE to the
// current month, rewritten on every run. The books keep changing after a
// month ends (a late bill, a reclassification), and one report request covers
// the whole range, so re-reading all of it is both the simplest and the only
// way the stored months always equal QuickBooks. Never deletes: an account
// that dropped out of the report (moved, merged, or all its activity
// reclassified) is written as zero for the months it no longer has.

// The history Dave asked for (2026-10-24), the same start as the invoice sync.
export const PNL_SINCE = "2024-01-01";

export type PnlSyncResult = {
  entity: QboEntity;
  ok: boolean;
  error?: string;
  months: number;
  accounts: number;
  upserted: number;
  zeroed: number;
};

export async function syncQboPnl(entity: QboEntity): Promise<PnlSyncResult> {
  const empty = { entity, months: 0, accounts: 0, upserted: 0, zeroed: 0 };
  const report = await fetchQboPnl(entity, PNL_SINCE, saigonToday());
  if (!report.ok) return { ...empty, ok: false, error: report.error };

  let stored;
  try {
    stored = await pnlLinesSince(entity, PNL_SINCE);
  } catch (e) {
    return { ...empty, ok: false, error: e instanceof Error ? e.message : "stored P&L read failed" };
  }

  const months = new Set(report.lines.map((l) => l.month));
  const seen = new Set(report.lines.map((l) => `${l.month}|${l.externalId}`));
  // Zero a stored amount the report no longer carries, only in the months the
  // report covers: a month outside them is not evidence of anything.
  const gone = stored.filter((l) => months.has(l.month.slice(0, 10)) && !seen.has(`${l.month.slice(0, 10)}|${l.externalId}`) && l.amountCents !== 0);

  const syncedAt = new Date().toISOString();
  const rows = [...report.lines, ...gone.map((l) => ({ ...l, amountCents: 0 }))].map((l) => ({
    entity,
    month: l.month.slice(0, 10),
    section: l.section,
    source: "quickbooks",
    external_id: l.externalId,
    parent_external_id: l.parentExternalId,
    account_name: l.accountName,
    position: l.position,
    amount_cents: l.amountCents,
    currency: report.currency,
    synced_at: syncedAt,
  }));

  const written = await mirrorPnlLines(rows);
  if (!written.ok) return { ...empty, ok: false, error: `pnl_monthly_lines upsert failed: ${written.error}` };
  return {
    entity,
    ok: true,
    months: months.size,
    accounts: new Set(report.lines.map((l) => l.externalId)).size,
    upserted: rows.length,
    zeroed: gone.length,
  };
}
