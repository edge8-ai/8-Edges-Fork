import { mustCount, mustRows } from "@/kernel/data/read";
import { qboConnection, qboConnectionsOnRealm } from "./qbo-connection";
import { qboFetch, type QboEntity } from "./qbo";
import { selectInvoices } from "./reads";

// Which QuickBooks books a connection is linked to, and what the invoice
// mirror holds for it. Settings → QuickBooks reads these to say whether a
// company is syncing, and the invoice sync reads qboSharedBooks before it
// writes a row.

// The connection Edge8 has always had. A second company linked to the same
// books is the wrong one: on 2026-10-07 the AIO connection was saved with
// Edge8's company, and the sync mirrored every Edge8 invoice a second time as
// AIO, which doubled the revenue on the dashboard.
const ORIGINAL: QboEntity = "edge8";

export type SharedBooks = { ok: true; sharedWith: QboEntity | null } | { ok: false; error: string };

/** The company whose books `entity` shares, or null when its books are its own. */
export async function qboSharedBooks(entity: QboEntity): Promise<SharedBooks> {
  if (entity === ORIGINAL) return { ok: true, sharedWith: null };
  const [own, original] = await Promise.all([qboConnection(entity), qboConnection(ORIGINAL)]);
  if (own.error) return { ok: false, error: `${entity} connection read failed: ${own.error.message}` };
  if (original.error) return { ok: false, error: `${ORIGINAL} connection read failed: ${original.error.message}` };
  const shared = Boolean(own.data && original.data && own.data.realm_id === original.data.realm_id);
  return { ok: true, sharedWith: shared ? ORIGINAL : null };
}

export type BooksHolder = { ok: true; heldBy: string | null } | { ok: false; error: string };

/**
 * The other company already linked to the QuickBooks books `realmId`, or null
 * when no other company holds them. The OAuth callback asks this before it
 * saves a connection: Intuit preselects the company last signed into, so a
 * reconnect of AIO lands on Edge8's books unless someone changes the picker,
 * and the invoice sync only noticed at its next run (2026-10-07, 2026-11-23).
 * A failed read is a failure, never a pass, because "nobody holds them" is the
 * permissive answer.
 */
export async function qboBooksHeldBy(entity: QboEntity, realmId: string): Promise<BooksHolder> {
  const { data, error } = await qboConnectionsOnRealm(realmId, entity);
  if (error) return { ok: false, error: `connection read failed: ${error.message}` };
  return { ok: true, heldBy: data?.[0]?.id ?? null };
}

/**
 * The company name QuickBooks holds for the books a connection is linked to.
 * Null when it cannot be read (not connected, or QuickBooks refused): the page
 * then says it could not check, and never guesses a name.
 */
export async function qboCompanyName(entity: QboEntity): Promise<string | null> {
  const query = encodeURIComponent("select * from CompanyInfo");
  const res = await qboFetch(`/query?query=${query}`, { method: "GET" }, entity);
  if (!res.ok) {
    console.error(`[qbo] ${entity} company name read failed:`, res.error);
    return null;
  }
  const info = (res.json.QueryResponse as { CompanyInfo?: { CompanyName?: string }[] } | undefined)?.CompanyInfo?.[0];
  return info?.CompanyName ?? null;
}

export type InvoiceMirror = {
  count: number;
  newest: { docNumber: string | null; txnDate: string | null } | null;
  lastSyncedAt: string | null;
};

/** What the ledger holds from one company's QuickBooks: how many, the newest, and when it last synced. */
export async function qboInvoiceMirror(entity: QboEntity): Promise<InvoiceMirror> {
  const what = `[finance/qbo-books] ${entity} invoices`;
  const [count, newest, synced] = await Promise.all([
    selectInvoices("id", { count: "exact", head: true }).eq("source", "quickbooks").eq("entity", entity),
    selectInvoices("doc_number, txn_date").eq("source", "quickbooks").eq("entity", entity).order("txn_date", { ascending: false }).limit(1),
    selectInvoices("synced_at").eq("source", "quickbooks").eq("entity", entity).order("synced_at", { ascending: false }).limit(1),
  ]);
  const newestRow = mustRows(newest, what)[0] as { doc_number: string | null; txn_date: string | null } | undefined;
  const syncedRow = mustRows(synced, what)[0] as { synced_at: string | null } | undefined;
  return {
    count: mustCount(count, what),
    newest: newestRow ? { docNumber: newestRow.doc_number, txnDate: newestRow.txn_date } : null,
    lastSyncedAt: syncedRow?.synced_at ?? null,
  };
}
