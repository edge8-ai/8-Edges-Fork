import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { healthSignalsSchema, type HealthSignals } from "./account-health-score";
import { listAccounts } from "./account-health";
import { liveRenewalsFor } from "./renewals";
import { renewalDueSoon, type Renewal } from "./renewal-vocab";

// The rows behind Revenue -> Accounts needing attention (S.6): every current
// client with its latest health reading and its live renewal. One row per
// COMPANY; nothing here is grouped by or filtered to a person.

export type AttentionRow = {
  id: string;
  name: string;
  /** Null until the routine has taken a reading that includes this account. */
  score: number | null;
  signals: HealthSignals | null;
  renewal: Renewal | null;
  renewalSoon: boolean;
};

/**
 * Lowest score first, because the screen's question is "who needs us". An
 * account with no reading yet goes last: nothing is known about it, which is
 * not the same as it being unhealthy. Among equal scores a renewal coming up
 * goes first, then the name, so the order is stable from one load to the next.
 */
export function sortAttention(rows: AttentionRow[]): AttentionRow[] {
  return [...rows].sort((a, b) => {
    if (a.score === null || b.score === null) {
      if (a.score !== b.score) return a.score === null ? 1 : -1;
    } else if (a.score !== b.score) {
      return a.score - b.score;
    }
    if (a.renewalSoon !== b.renewalSoon) return a.renewalSoon ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

type SnapshotRow = { company_id: string; score: number; signals: unknown };

export async function loadAccountsNeedingAttention(today: string): Promise<{ rows: AttentionRow[]; takenOn: string | null }> {
  const accounts = await listAccounts(today);
  const ids = accounts.map((a) => a.id);
  // The latest night the routine wrote. Every account current that night got a
  // row, so one day's readings are the whole picture; an account that became a
  // client since has no row yet and says so.
  const latest = mustRows(
    await companyOs.from("account_health_snapshots").select("taken_on").order("taken_on", { ascending: false }).limit(1),
    "[crm/accounts] latest reading day",
  );
  const takenOn = (latest[0]?.taken_on as string | undefined) ?? null;
  const [snapshots, renewals] = await Promise.all([
    takenOn && ids.length > 0
      ? companyOs.from("account_health_snapshots").select("company_id, score, signals").eq("taken_on", takenOn).in("company_id", ids)
      : Promise.resolve({ data: [] as SnapshotRow[], error: null }),
    liveRenewalsFor(ids),
  ]);
  const byCompany = new Map(
    (mustRows(snapshots, "[crm/accounts] readings") as SnapshotRow[]).map((s) => [s.company_id, s]),
  );
  const rows = accounts.map((a): AttentionRow => {
    const snap = byCompany.get(a.id);
    // The signals are jsonb written by this entity's own routine; parsing them
    // guards the screen against a row an older routine wrote in another shape.
    const parsed = snap ? healthSignalsSchema.safeParse(snap.signals) : null;
    const renewal = renewals.get(a.id) ?? null;
    return {
      id: a.id,
      name: a.name || "(no name)",
      score: snap?.score ?? null,
      signals: parsed?.success ? parsed.data : null,
      renewal,
      renewalSoon: renewalDueSoon(renewal, today),
    };
  });
  return { rows: sortAttention(rows), takenOn };
}
