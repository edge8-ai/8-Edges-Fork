// Talking to Lark as a PERSON rather than as the Edge8 app: the OAuth round
// trip, the token refresh, and the three Minutes calls the coaching pickup
// needs. Distinct from lark-transport.ts (the tenant app), because the tenant
// app cannot do this job: the Minutes list endpoint answers it 404, and Lark
// refuses it on a coach's own recordings unless each one is shared with it. A
// person's own authorisation can search and read their Minutes, which is what
// a pasted link was standing in for (2026-10-08).
//
// No storage here: kernel/ holds no entity's tables. The caller keeps the
// tokens (company_os.lark_user_connections, owned by coaching) and hands an
// access token in. Every function is fail-soft and returns an error string
// rather than throwing, so a cron run reports a dead connection and moves on.

const HOST = process.env.LARK_API_HOST || process.env.LARK_API_BASE || "https://open.larksuite.com";
const ACCOUNTS = process.env.LARK_ACCOUNTS_HOST || "https://accounts.larksuite.com";

// What the pickup needs and nothing more: find recordings, read their title
// and time, read the transcript, and keep working without a person present.
export const LARK_USER_SCOPES = [
  "minutes:minutes.search:read",
  "minutes:minutes.basic:read",
  "minutes:minutes.artifacts:read",
  "offline_access",
] as const;

// Read access to a person's calendar: their primary calendar, its events and
// who is invited. Only someone who connects with ?calendar=1 grants it, so a
// coach connecting for their recordings is never asked for their diary.
export const LARK_CALENDAR_SCOPE = "calendar:calendar:readonly";

export type LarkUserTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  scope: string | null;
};

export function larkUserConfigured(): boolean {
  return Boolean(process.env.LARK_APP_ID && process.env.LARK_APP_SECRET);
}

/** Where to send a person to approve the Edge8 app reading their Minutes. */
export function larkAuthorizeUrl(state: string, redirectUri: string, extraScopes: readonly string[] = []): string {
  const q = new URLSearchParams({
    client_id: process.env.LARK_APP_ID ?? "",
    response_type: "code",
    redirect_uri: redirectUri,
    scope: [...LARK_USER_SCOPES, ...extraScopes].join(" "),
    state,
  });
  return `${ACCOUNTS}/open-apis/authen/v1/authorize?${q}`;
}

type TokenReply = {
  code?: number;
  error?: string;
  error_description?: string;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
};

async function tokenCall(body: Record<string, string>): Promise<LarkUserTokens | { error: string }> {
  try {
    const res = await fetch(`${HOST}/open-apis/authen/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ client_id: process.env.LARK_APP_ID, client_secret: process.env.LARK_APP_SECRET, ...body }),
      cache: "no-store",
    });
    const json = (await res.json()) as TokenReply;
    if (!json.access_token || !json.refresh_token) {
      return { error: json.error_description || json.error || `HTTP ${res.status} code ${json.code ?? "?"}` };
    }
    const now = Date.now();
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      accessExpiresAt: new Date(now + (json.expires_in ?? 7200) * 1000).toISOString(),
      refreshExpiresAt: new Date(now + (json.refresh_token_expires_in ?? 30 * 86400) * 1000).toISOString(),
      scope: json.scope ?? null,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export function exchangeLarkCode(code: string, redirectUri: string): Promise<LarkUserTokens | { error: string }> {
  return tokenCall({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

/** Lark rotates the refresh token on every refresh: store both that come back. */
export function refreshLarkTokens(refreshToken: string): Promise<LarkUserTokens | { error: string }> {
  return tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
}

async function userGet<T>(accessToken: string, path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${HOST}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=utf-8" },
      cache: "no-store",
    });
    const text = await res.text();
    let json: { code?: number; msg?: string; data?: T };
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120)}` };
    }
    if (json.code !== 0 || !json.data) return { ok: false, error: `${path}: ${json.code} ${json.msg ?? ""}`.trim() };
    return { ok: true, data: json.data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The person's open_id under the Edge8 app. */
export async function larkUserOpenId(accessToken: string): Promise<string | null> {
  const res = await userGet<{ open_id?: string }>(accessToken, "/open-apis/authen/v1/user_info");
  return res.ok ? (res.data.open_id ?? null) : null;
}

/**
 * Tokens of the Minutes this person owns that match `query`, created since
 * `sinceISO`. Search is keyword search, so the caller still checks each title.
 */
export async function searchOwnMinutes(
  accessToken: string,
  openId: string,
  query: string,
  sinceISO: string,
): Promise<{ ok: true; tokens: string[] } | { ok: false; error: string }> {
  const tokens: string[] = [];
  let pageToken: string | undefined;
  // A coach records a few 1-1s a week; five pages of thirty is far past any
  // two-week window and stops a runaway loop on a bad page token.
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({ page_size: "30", ...(pageToken ? { page_token: pageToken } : {}) });
    const res = await userGet<{ items?: { token?: string }[]; has_more?: boolean; page_token?: string }>(
      accessToken,
      `/open-apis/minutes/v1/minutes/search?${q}`,
      {
        method: "POST",
        body: JSON.stringify({
          query,
          filter: { owner_ids: [openId], create_time: { start_time: sinceISO, end_time: new Date().toISOString() } },
        }),
      },
    );
    if (!res.ok) return res;
    for (const item of res.data.items ?? []) if (item.token) tokens.push(item.token);
    if (!res.data.has_more || !res.data.page_token) break;
    pageToken = res.data.page_token;
  }
  return { ok: true, tokens };
}

/** A recording's title and start time. */
export async function getOwnMinute(
  accessToken: string,
  minuteToken: string,
): Promise<{ ok: true; title: string; startedAt: string } | { ok: false; error: string }> {
  const res = await userGet<{ minute?: { title?: string; create_time?: string | number } }>(
    accessToken,
    `/open-apis/minutes/v1/minutes/${encodeURIComponent(minuteToken)}`,
  );
  if (!res.ok) return res;
  const m = res.data.minute;
  if (!m?.create_time) return { ok: false, error: "no create_time" };
  return { ok: true, title: m.title ?? "", startedAt: new Date(Number(m.create_time)).toISOString() };
}

/** The recording's transcript text, or null while Lark is still writing it. */
export async function getOwnMinuteTranscript(
  accessToken: string,
  minuteToken: string,
): Promise<{ ok: true; transcript: string | null } | { ok: false; error: string }> {
  const res = await userGet<{ transcript?: string }>(
    accessToken,
    `/open-apis/minutes/v1/minutes/${encodeURIComponent(minuteToken)}/artifacts`,
  );
  if (!res.ok) return res;
  const text = res.data.transcript?.trim();
  return { ok: true, transcript: text ? text : null };
}

export type LarkCalendarEvent = { eventId: string; title: string; startsAt: string };

export type LarkEventAttendee = { type: string; email: string | null; displayName: string | null; isExternal: boolean };

/** The id of the person's own primary calendar. */
export async function primaryCalendarId(accessToken: string): Promise<{ ok: true; calendarId: string } | { ok: false; error: string }> {
  const res = await userGet<{ calendars?: { calendar?: { calendar_id?: string } }[] }>(
    accessToken,
    "/open-apis/calendar/v4/calendars/primary",
    { method: "POST" },
  );
  if (!res.ok) return res;
  const calendarId = res.data.calendars?.[0]?.calendar?.calendar_id;
  return calendarId ? { ok: true, calendarId } : { ok: false, error: "no primary calendar" };
}

/**
 * The live events on a calendar between two moments, repeating events expanded.
 * Lark serves this view for at most 40 days at a time and without paging.
 */
export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  from: Date,
  to: Date,
): Promise<{ ok: true; events: LarkCalendarEvent[] } | { ok: false; error: string }> {
  const q = new URLSearchParams({
    start_time: String(Math.floor(from.getTime() / 1000)),
    end_time: String(Math.floor(to.getTime() / 1000)),
  });
  const res = await userGet<{
    items?: { event_id?: string; summary?: string; status?: string; start_time?: { timestamp?: string } }[];
  }>(accessToken, `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/instance_view?${q}`);
  if (!res.ok) return res;
  const events: LarkCalendarEvent[] = [];
  for (const item of res.data.items ?? []) {
    // An all-day event has a date and no timestamp; a booked call always has one.
    if (!item.event_id || !item.start_time?.timestamp || item.status === "cancelled") continue;
    events.push({
      eventId: item.event_id,
      title: item.summary ?? "",
      startsAt: new Date(Number(item.start_time.timestamp) * 1000).toISOString(),
    });
  }
  return { ok: true, events };
}

/** Who is invited to an event. A person outside the tenant carries an email only when Lark holds one. */
export async function listEventAttendees(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<{ ok: true; attendees: LarkEventAttendee[] } | { ok: false; error: string }> {
  const res = await userGet<{
    items?: { type?: string; third_party_email?: string; display_name?: string; is_external?: boolean }[];
  }>(
    accessToken,
    `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/attendees?page_size=100`,
  );
  if (!res.ok) return res;
  return {
    ok: true,
    attendees: (res.data.items ?? []).map((a) => ({
      type: a.type ?? "",
      email: a.third_party_email ?? null,
      displayName: a.display_name ?? null,
      isExternal: a.is_external === true,
    })),
  };
}
