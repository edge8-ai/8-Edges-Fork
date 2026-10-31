import { companyOs } from "@/kernel/data/supabase";
import { qboConnection, rotateQboTokens, saveQboConnection } from "@/entities/finance";
import type { Database } from "@/kernel/data/supabase/database.types";

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

// The connection read that keeps a failure apart from an absent row. The
// keepalive reports what happened to a refresh, and "the read failed" is not
// "not connected" or "nobody else rotated", so it reads through this.
async function readConnection(
  entity: QboEntity,
): Promise<{ ok: true; conn: ConnectionRow | null } | { ok: false; error: string }> {
  const { data, error } = await qboConnection(entity);
  if (error) return { ok: false, error: error.message };
  return { ok: true, conn: data ?? null };
}

// The tolerant read for callers that degrade to "not connected" on a failure.
async function loadConnection(entity: QboEntity): Promise<ConnectionRow | null> {
  const read = await readConnection(entity);
  if (!read.ok) {
    console.error("[qbo] connection load failed:", read.error);
    return null;
  }
  return read.conn;
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

  return saveQboConnection({
    id: entity,
    realm_id: realmId,
    environment: QBO_ENV,
    connected_by: connectedBy,
    ...tokenRow(tokens),
  });
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
  const { data: updated, error } = await rotateQboTokens(entity, conn.refresh_token, tokenRow(tokens));
  if (error) console.error("[qbo] token persist failed:", error.message);
  if (!error && (updated ?? []).length === 0) {
    // Lost the race — use the winner's tokens.
    const winner = await loadConnection(entity);
    if (winner) return { accessToken: winner.access_token, realmId: winner.realm_id };
  }
  return { accessToken: tokens.access_token, realmId: conn.realm_id };
}

// What a keepalive refresh came to. `note` is set when the connection is fine
// but not because of this refresh: another lambda rotated the token first.
export type QboRefreshResult = { ok: boolean; error?: string; note?: string };

// Exported for the weekly keepalive cron: refreshes tokens so the ~100-day
// refresh-token idle expiry never hits between invoices. It follows the same
// rotation rules as getAccessToken, but reports rather than recovers: a
// persist that matched no row, or a refresh Intuit refused, is checked against
// a fresh read before it is called a failure, because a concurrent rotation
// leaves the connection alive with the winner's tokens.
export async function refreshQboTokens(
  entity: QboEntity = DEFAULT_ENTITY,
): Promise<QboRefreshResult> {
  const read = await readConnection(entity);
  if (!read.ok) return { ok: false, error: `connection read failed: ${read.error}` };
  const conn = read.conn;
  if (!conn) return { ok: false, error: "not connected" };

  const tokens = await requestTokens(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  );
  if ("error" in tokens) return rotatedElsewhere(entity, conn.refresh_token, tokens.error);

  // The conditional update on the OLD refresh token is the serialization
  // point; `select("id")` makes the matched rows visible, since a filter that
  // matches nothing is not an error to PostgREST.
  const { data: updated, error } = await rotateQboTokens(entity, conn.refresh_token, tokenRow(tokens));
  if (error) return { ok: false, error: `token persist failed: ${error.message}` };
  if ((updated ?? []).length > 0) return { ok: true };
  return rotatedElsewhere(entity, conn.refresh_token, "token persist matched no row");
}

// Decides a refresh that did not land: if the stored refresh token is no
// longer the one this run used, someone else rotated and the connection holds
// their tokens, which is a healthy connection. Otherwise `failure` stands.
async function rotatedElsewhere(
  entity: QboEntity,
  usedRefreshToken: string,
  failure: string,
): Promise<QboRefreshResult> {
  const reread = await readConnection(entity);
  if (!reread.ok) return { ok: false, error: `${failure}; re-read failed: ${reread.error}` };
  if (!reread.conn) return { ok: false, error: `${failure}; the connection is gone` };
  if (reread.conn.refresh_token !== usedRefreshToken) {
    return { ok: true, note: `another refresh rotated the token first (${failure}); the connection holds its tokens` };
  }
  return { ok: false, error: failure };
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
