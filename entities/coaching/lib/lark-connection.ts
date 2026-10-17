import { companyOs } from "@/kernel/data/supabase";
import { mustRows, readOr } from "@/kernel/data/read";
import type { TeamActor } from "@/kernel/identity/team-auth";
import { refreshLarkTokens, type LarkUserTokens } from "@/kernel/messaging/lark-user";
import type { Result } from "@/kernel/data/result";

// A coach's connected Lark account (company_os.lark_user_connections): what the
// daily 1-1 pickup uses to search and read that coach's own recordings. Tokens
// never leave the server; the page only learns whether a connection exists.

export type LarkConnection = {
  teamMemberId: string;
  openId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
};

export type LarkConnectionStatus = {
  connected: boolean;
  lastError: string | null;
  refreshExpiresAt: string | null;
};

const COLUMNS = "team_member_id, open_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, last_error";

function toConnection(r: Record<string, unknown>): LarkConnection {
  return {
    teamMemberId: r.team_member_id as string,
    openId: r.open_id as string,
    accessToken: r.access_token as string,
    refreshToken: r.refresh_token as string,
    accessExpiresAt: r.access_token_expires_at as string,
    refreshExpiresAt: r.refresh_token_expires_at as string,
  };
}

/** Whether this person has connected Lark, for the coach page. No tokens. */
export async function getLarkConnection(actor: Pick<TeamActor, "teamMemberId">): Promise<LarkConnectionStatus> {
  // A failed read shows the Connect button, which is the harmless answer: the
  // worst it does is offer a reconnect to someone already connected.
  const row = readOr(
    await companyOs
      .from("lark_user_connections")
      .select("last_error, refresh_token_expires_at")
      .eq("team_member_id", actor.teamMemberId)
      .maybeSingle(),
    "[coaching/lark] lark_user_connections (status)",
    null,
  ) as { last_error: string | null; refresh_token_expires_at: string } | null;
  const live = Boolean(row && new Date(row.refresh_token_expires_at).getTime() > Date.now());
  return { connected: live, lastError: row?.last_error ?? null, refreshExpiresAt: row?.refresh_token_expires_at ?? null };
}

/** Every connection the daily pickup walks. */
export async function listLarkConnections(): Promise<LarkConnection[]> {
  const rows = mustRows(
    await companyOs.from("lark_user_connections").select(COLUMNS),
    "[coaching/lark] lark_user_connections",
  ) as unknown as Record<string, unknown>[];
  return rows.map(toConnection);
}

function tokenColumns(t: LarkUserTokens) {
  return {
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    access_token_expires_at: t.accessExpiresAt,
    refresh_token_expires_at: t.refreshExpiresAt,
    scope: t.scope,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
}

/** Store a fresh connection from the OAuth callback, replacing any old one. */
export async function saveLarkConnection(teamMemberId: string, openId: string, tokens: LarkUserTokens): Promise<Result> {
  const { error } = await companyOs
    .from("lark_user_connections")
    .upsert(
      { team_member_id: teamMemberId, open_id: openId, connected_at: new Date().toISOString(), ...tokenColumns(tokens) },
      { onConflict: "team_member_id" },
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Record why the last run could not use this connection. */
export async function noteLarkError(teamMemberId: string, message: string): Promise<void> {
  const { error } = await companyOs
    .from("lark_user_connections")
    .update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("team_member_id", teamMemberId);
  if (error) console.error("[coaching/lark] note error", error.message);
}

/**
 * A usable access token, refreshing when it is within five minutes of expiry.
 * Lark rotates the refresh token on every refresh, so the write is conditional
 * on the token this run read: if another run rotated first, its tokens win and
 * are re-read, rather than this run storing a token Lark has already retired.
 */
export async function freshAccessToken(conn: LarkConnection): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (new Date(conn.accessExpiresAt).getTime() - Date.now() > 5 * 60_000) return { ok: true, token: conn.accessToken };
  const tokens = await refreshLarkTokens(conn.refreshToken);
  if ("error" in tokens) {
    // A failed re-read falls through to reporting the refresh failure, which
    // is what it is either way.
    const reread = readOr(
      await companyOs.from("lark_user_connections").select(COLUMNS).eq("team_member_id", conn.teamMemberId).maybeSingle(),
      "[coaching/lark] lark_user_connections (reread)",
      null,
    );
    if (reread && reread.refresh_token !== conn.refreshToken) return { ok: true, token: reread.access_token as string };
    return { ok: false, error: `Lark refresh failed: ${tokens.error}` };
  }
  const { data: updated, error } = await companyOs
    .from("lark_user_connections")
    .update(tokenColumns(tokens))
    .eq("team_member_id", conn.teamMemberId)
    .eq("refresh_token", conn.refreshToken)
    .select("team_member_id");
  if (error) return { ok: false, error: `Lark token save failed: ${error.message}` };
  if ((updated ?? []).length === 0) {
    // Lost the race: the winner's token is the live one. Unreadable, ours is
    // still valid for this run, which is the fallback below.
    const winner = readOr(
      await companyOs.from("lark_user_connections").select("access_token").eq("team_member_id", conn.teamMemberId).maybeSingle(),
      "[coaching/lark] lark_user_connections (winner)",
      null,
    );
    if (winner) return { ok: true, token: winner.access_token as string };
  }
  return { ok: true, token: tokens.accessToken };
}
