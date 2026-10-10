import { companyOs } from "@/kernel/data/supabase";
import { updateQboConnection, selectQboConnection, upsertQboConnection } from "@/entities/finance";
import type { Database } from "@/kernel/data/supabase/database.types";
import { saigonToday } from "@/kernel/config/dates";

// Server-only QuickBooks Online client. NEVER import from a client component.
//
// Two connections, one row each in company_os.qbo_connection, keyed by
// entity: the deployment's own slug (private retreats + client work billing)
// and 'aio' (public retreats). One Intuit app authorizes both; each company
// has its own realm_id + token set. Callers that predate the second company
// pass nothing and default to 'edge8'. OAuth quirks that shape this module:
//  - access tokens last ~60 min; refresh tokens ROTATE on every refresh and
//    die ~100 days after issue. An unpersisted rotation bricks the
//    connection, so the refresh write is a conditional update keyed on the
//    refresh token we used — if another lambda rotated first, we re-read and
//    use its tokens instead of clobbering them.
//  - business calls never throw: they return {ok:false} and the caller
//    degrades (billing → manual_required + accountant email).
//
// Env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI,
// QBO_ENV ('sandbox' | 'production'), QBO_SERVICE_ITEM_ID (the "Contractor
// Services" service item invoices line against — one-time QBO setup).
// Plan: docs/plans/2026-07-18-client-work-requests.md

const QBO_ENV = process.env.QBO_ENV === "sandbox" ? "sandbox" : "production";
const API_BASE =
  QBO_ENV === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const MINOR_VERSION = "75";

// Which QuickBooks company a call targets. The row id in qbo_connection IS
// this string. 'edge8' is the original connection (migrated from the old
// 'default' row id); 'aio' is the public-retreats company.
export type QboEntity = "edge8" | "aio";
const DEFAULT_ENTITY: QboEntity = "edge8";

// The row shape comes from the generated schema snapshot (AR-01) rather than a
// hand-written copy, so a column rename in company_os.qbo_connection fails the
// type check here instead of surfacing as an undefined at runtime.
type ConnectionRow = Database["company_os"]["Tables"]["qbo_connection"]["Row"];

export type QboConnectionStatus =
  | { connected: false }
  | {
      connected: true;
      realmId: string;
      environment: string;
      connectedBy: string;
      refreshTokenExpiresAt: string;
      updatedAt: string;
    };

function basicAuth(): string {
  return Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString("base64");
}

export function qboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET && process.env.QBO_REDIRECT_URI);
}

async function loadConnection(entity: QboEntity): Promise<ConnectionRow | null> {
  const { data, error } = await selectQboConnection("*")
    .eq("id", entity)
    .maybeSingle();
  if (error) {
    console.error("[qbo] connection load failed:", error.message);
    return null;
  }
  return (data as ConnectionRow | null) ?? null;
}

export async function getQboConnectionStatus(
  entity: QboEntity = DEFAULT_ENTITY,
): Promise<QboConnectionStatus> {
  const conn = await loadConnection(entity);
  if (!conn) return { connected: false };
  return {
    connected: true,
    realmId: conn.realm_id,
    environment: conn.environment,
    connectedBy: conn.connected_by,
    refreshTokenExpiresAt: conn.refresh_token_expires_at,
    updatedAt: conn.updated_at,
  };
}

export function buildQboAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID ?? "",
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: process.env.QBO_REDIRECT_URI ?? "",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  x_refresh_token_expires_in: number; // seconds
};

async function requestTokens(body: URLSearchParams): Promise<TokenResponse | { error: string }> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error as string) || `HTTP ${res.status}`;
      return { error: err };
    }
    return json as unknown as TokenResponse;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "network error" };
  }
}

function tokenRow(tokens: TokenResponse) {
  const now = Date.now();
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
    refresh_token_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// Authorization-code exchange from the OAuth callback. Upserts the single row.
export async function exchangeQboCode(
  code: string,
  realmId: string,
  connectedBy: string,
  entity: QboEntity = DEFAULT_ENTITY,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tokens = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI ?? "",
    }),
  );
  if ("error" in tokens) return { ok: false, error: tokens.error };

  const { error } = await upsertQboConnection({
    id: entity,
    realm_id: realmId,
    environment: QBO_ENV,
    connected_by: connectedBy,
    ...tokenRow(tokens),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Refresh-on-demand with rotation safety. Returns a usable access token +
// realm id, or null when disconnected/expired (callers degrade, never throw).
async function getAccessToken(
  entity: QboEntity,
): Promise<{ accessToken: string; realmId: string } | null> {
  const conn = await loadConnection(entity);
  if (!conn) return null;

  // Fresh enough — use as-is (2 min headroom for the API call itself).
  if (new Date(conn.access_token_expires_at).getTime() - Date.now() > 2 * 60_000) {
    return { accessToken: conn.access_token, realmId: conn.realm_id };
  }

  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  );
  if ("error" in tokens) {
    // invalid_grant = the refresh token is dead (expired or superseded by a
    // rotation we lost) — a concurrent lambda may have refreshed first, so
    // re-read before giving up.
    const reread = await loadConnection(entity);
    if (reread && reread.refresh_token !== conn.refresh_token) {
      return { accessToken: reread.access_token, realmId: reread.realm_id };
    }
    console.error("[qbo] token refresh failed:", tokens.error);
    return null;
  }

  // Persist the rotation, but only if nobody else rotated while we did: the
  // conditional update on the OLD refresh token is the serialization point
  // across concurrent lambdas.
  const { data: updated, error } = await updateQboConnection(tokenRow(tokens))
    .eq("id", entity)
    .eq("refresh_token", conn.refresh_token)
    .select("id");
  if (error) console.error("[qbo] token persist failed:", error.message);
  if (!error && (updated ?? []).length === 0) {
    // Lost the race — use the winner's tokens.
    const winner = await loadConnection(entity);
    if (winner) return { accessToken: winner.access_token, realmId: winner.realm_id };
  }
  return { accessToken: tokens.access_token, realmId: conn.realm_id };
}

// Exported for the weekly keepalive cron: refreshes tokens so the ~100-day
// refresh-token idle expiry never hits between invoices.
export async function refreshQboTokens(
  entity: QboEntity = DEFAULT_ENTITY,
): Promise<{ ok: boolean; error?: string }> {
  const conn = await loadConnection(entity);
  if (!conn) return { ok: false, error: "not connected" };
  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  );
  if ("error" in tokens) return { ok: false, error: tokens.error };
  const { error } = await updateQboConnection(tokenRow(tokens))
    .eq("id", entity)
    .eq("refresh_token", conn.refresh_token);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function qboFetch(
  path: string,
  init: RequestInit,
  entity: QboEntity = DEFAULT_ENTITY,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }> {
  const auth = await getAccessToken(entity);
  if (!auth) return { ok: false, error: "QuickBooks is not connected (reconnect at /admin/settings/quickbooks)." };

  try {
    const url = `${API_BASE}/v3/company/${auth.realmId}${path}${path.includes("?") ? "&" : "?"}minorversion=${MINOR_VERSION}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const fault = JSON.stringify((json as { Fault?: unknown }).Fault ?? json).slice(0, 500);
      return { ok: false, error: `QBO ${res.status}: ${fault}` };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export type QboInvoice = {
  id: string;
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  totalCents: number;
  currency: string;
};

type QboInvoiceJson = {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  CurrencyRef?: { value?: string };
};

// One service line: hours × rate against the "Contractor Services" item.
export async function createQboInvoice(args: {
  customerId: string;
  hours: number;
  rateCents: number;
  description: string;
  memo?: string;
}): Promise<{ ok: true; invoice: QboInvoice } | { ok: false; error: string }> {
  const itemId = process.env.QBO_SERVICE_ITEM_ID;
  if (!itemId) return { ok: false, error: "QBO_SERVICE_ITEM_ID is not set." };

  const rate = args.rateCents / 100;
  const amount = Math.round(args.hours * args.rateCents) / 100;
  const body = {
    CustomerRef: { value: args.customerId },
    Line: [
      {
        DetailType: "SalesItemLineDetail",
        Amount: amount,
        Description: args.description,
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          Qty: args.hours,
          UnitPrice: rate,
        },
      },
    ],
    ...(args.memo ? { PrivateNote: args.memo } : {}),
  };

  const res = await qboFetch("/invoice", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) return res;

  const inv = (res.json.Invoice ?? {}) as QboInvoiceJson;
  if (!inv.Id) return { ok: false, error: "QBO returned no invoice id." };
  return {
    ok: true,
    invoice: {
      id: inv.Id,
      docNumber: inv.DocNumber ?? null,
      txnDate: inv.TxnDate ?? saigonToday(),
      dueDate: inv.DueDate ?? null,
      totalCents: Math.round((inv.TotalAmt ?? amount) * 100),
      currency: (inv.CurrencyRef?.value ?? "USD").toLowerCase(),
    },
  };
}

// QBO emails the invoice to the customer (their billing email on the QBO
// customer record, or an explicit override).
export async function sendQboInvoice(
  invoiceId: string,
  toEmail?: string,
): Promise<{ ok: boolean; error?: string }> {
  const path = toEmail
    ? `/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(toEmail)}`
    : `/invoice/${invoiceId}/send`;
  const res = await qboFetch(path, { method: "POST" });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

// One invoice as QBO returns it, flattened to what the mirror stores. Kept
// here (QBO-shaped) so lib/admin/qbo-invoice-sync.ts deals only in DB rows.
export type QboSyncLine = { description: string; quantity: number; rate: number; amount: number; item_name: string };
export type QboSyncInvoice = {
  externalId: string; // bare QBO Invoice.Id
  docNumber: string | null;
  txnDate: string;
  dueDate: string | null;
  currency: string;
  amountCents: number;
  balanceCents: number;
  // US dollars per unit of the invoice currency, as QuickBooks booked it on
  // the invoice; null when QuickBooks sent none (a USD invoice needs none).
  exchangeRate: number | null;
  memo: string | null;
  customerId: string | null;
  customerName: string | null;
  lines: QboSyncLine[];
};

type QboQueryInvoice = QboInvoiceJson & {
  Balance?: number;
  ExchangeRate?: number;
  PrivateNote?: string;
  CustomerRef?: { value?: string; name?: string };
  Line?: Array<{
    Amount?: number;
    Description?: string;
    DetailType?: string;
    SalesItemLineDetail?: { ItemRef?: { name?: string }; Qty?: number; UnitPrice?: number };
  }>;
};

function parseInvoice(inv: QboQueryInvoice): QboSyncInvoice {
  const lines: QboSyncLine[] = (inv.Line ?? [])
    .filter((l) => l.DetailType === "SalesItemLineDetail")
    .map((l) => ({
      description: l.Description ?? "",
      quantity: l.SalesItemLineDetail?.Qty ?? 0,
      rate: l.SalesItemLineDetail?.UnitPrice ?? 0,
      amount: l.Amount ?? 0,
      item_name: l.SalesItemLineDetail?.ItemRef?.name ?? "",
    }));
  return {
    externalId: String(inv.Id ?? ""),
    docNumber: inv.DocNumber ?? null,
    txnDate: inv.TxnDate ?? "",
    dueDate: inv.DueDate ?? null,
    currency: (inv.CurrencyRef?.value ?? "USD").toLowerCase(),
    amountCents: Math.round((inv.TotalAmt ?? 0) * 100),
    balanceCents: Math.round((inv.Balance ?? 0) * 100),
    exchangeRate: typeof inv.ExchangeRate === "number" ? inv.ExchangeRate : null,
    memo: inv.PrivateNote ?? null,
    customerId: inv.CustomerRef?.value ?? null,
    customerName: inv.CustomerRef?.name ?? null,
    lines,
  };
}

// Pull every invoice for one company on/after `since` (YYYY-MM-DD), paging
// through the QBO query API (1000/page). Read-only; degrades to {ok:false}.
export async function listQboInvoices(
  entity: QboEntity,
  since: string,
): Promise<{ ok: true; invoices: QboSyncInvoice[] } | { ok: false; error: string }> {
  const PAGE = 1000;
  const out: QboSyncInvoice[] = [];
  let start = 1;
  // Bounded loop: 50 pages = 50k invoices, far beyond any real book.
  for (let guard = 0; guard < 50; guard++) {
    const sql =
      `select * from Invoice where TxnDate >= '${since}'` +
      ` order by TxnDate startposition ${start} maxresults ${PAGE}`;
    const res = await qboFetch(`/query?query=${encodeURIComponent(sql)}`, { method: "GET" }, entity);
    if (!res.ok) return res;
    const qr = (res.json.QueryResponse ?? {}) as { Invoice?: QboQueryInvoice[] };
    const batch = qr.Invoice ?? [];
    out.push(...batch.map(parseInvoice));
    if (batch.length < PAGE) break;
    start += PAGE;
  }
  return { ok: true, invoices: out };
}
