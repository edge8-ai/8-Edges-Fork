import { getQboConnectionStatus, qboCompanyName, qboInvoiceMirror, qboSharedBooks, type InvoiceMirror, type QboEntity } from "@/entities/finance";
import { listRoutineRuns } from "@/kernel/audit/routine-runs-readers";

// What Settings → QuickBooks says about each company: is its invoice mirror
// in sync, and if not, why. The page used to show a green "Connected" badge
// from the token row alone, which stayed green for five weeks while AIO was
// linked to Edge8's books and not syncing at all.

export const INVOICE_SYNC_ROUTINE = "/api/cron/qbo-invoice-sync/";
/** Weekly runs shown in the history strip. */
export const HISTORY_RUNS = 6;
// A weekly sync older than this has missed a run.
const STALE_MS = 8 * 86_400_000;

/** One weekly run, as it went for one company. "off" is a run that did not include it. */
export type RunMark = { startedAt: string; outcome: "ok" | "failed" | "off"; error: string | null };

export type SyncHealth =
  | { tone: "ok"; headline: "Invoices in sync" }
  | { tone: "warn"; headline: "Not connected" | "Sync is overdue" | "Waiting for the first sync" }
  | { tone: "err"; headline: "Not syncing: linked to the wrong books" | "Last sync failed"; error?: string };

export type CompanySync = {
  entity: QboEntity;
  connected: boolean;
  realmId: string | null;
  companyName: string | null;
  sharedWith: QboEntity | null;
  mirror: InvoiceMirror;
  runs: RunMark[];
  health: SyncHealth;
  connection: Awaited<ReturnType<typeof getQboConnectionStatus>>;
};

type RunRow = { started_at: string; status: string; error: string | null; result: unknown };
type EntityResult = { entity?: string; ok?: boolean; error?: string };

/** How each stored run went for one company, newest first. */
export function runMarks(runs: RunRow[], entity: QboEntity): RunMark[] {
  return runs.map((run) => {
    const results = (run.result as { results?: EntityResult[] } | null)?.results;
    const mine = Array.isArray(results) ? results.find((r) => r.entity === entity) : undefined;
    if (mine) return { startedAt: run.started_at, outcome: mine.ok ? "ok" : "failed", error: mine.ok ? null : (mine.error ?? null) };
    // A run that died before it wrote any result failed for every company.
    if (!Array.isArray(results) && (run.status === "error" || run.status === "died")) {
      return { startedAt: run.started_at, outcome: "failed", error: run.error };
    }
    return { startedAt: run.started_at, outcome: "off", error: null };
  });
}

/** The one line each card leads with. Order matters: the worst true thing wins. */
export function syncHealth(input: {
  connected: boolean;
  sharedWith: QboEntity | null;
  latest: RunMark | undefined;
  lastSyncedAt: string | null;
  now: number;
}): SyncHealth {
  if (!input.connected) return { tone: "warn", headline: "Not connected" };
  if (input.sharedWith) return { tone: "err", headline: "Not syncing: linked to the wrong books" };
  if (input.latest?.outcome === "failed") return { tone: "err", headline: "Last sync failed", error: input.latest.error ?? undefined };
  if (!input.lastSyncedAt) return { tone: "warn", headline: "Waiting for the first sync" };
  if (input.now - new Date(input.lastSyncedAt).getTime() > STALE_MS) return { tone: "warn", headline: "Sync is overdue" };
  return { tone: "ok", headline: "Invoices in sync" };
}

/**
 * The next weekly run, Mondays 05:30 UTC: the schedule in
 * crons/qbo-invoice-sync.ts, pinned against this by the test.
 */
export function nextWeeklySync(now: Date): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 5, 30));
  const daysToMonday = (1 - next.getUTCDay() + 7) % 7;
  next.setUTCDate(next.getUTCDate() + daysToMonday);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

export async function companySync(entity: QboEntity, runs: RunRow[], now: number): Promise<CompanySync> {
  const connection = await getQboConnectionStatus(entity);
  const [books, companyName, mirror] = await Promise.all([
    qboSharedBooks(entity),
    connection.connected ? qboCompanyName(entity) : Promise.resolve(null),
    qboInvoiceMirror(entity),
  ]);
  if (!books.ok) throw new Error(books.error);
  const marks = runMarks(runs, entity);
  return {
    entity,
    connected: connection.connected,
    realmId: connection.connected ? connection.realmId : null,
    companyName,
    sharedWith: books.sharedWith,
    mirror,
    runs: marks,
    health: syncHealth({ connected: connection.connected, sharedWith: books.sharedWith, latest: marks[0], lastSyncedAt: mirror.lastSyncedAt, now }),
    connection,
  };
}

/** Every company's sync, read once per page load. */
export async function qboSyncOverview(entities: QboEntity[], now: number): Promise<CompanySync[]> {
  const runs = (await listRoutineRuns(INVOICE_SYNC_ROUTINE, HISTORY_RUNS)) as RunRow[];
  return Promise.all(entities.map((e) => companySync(e, runs, now)));
}
