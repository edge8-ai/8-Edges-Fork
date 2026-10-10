// Lark tenant-app API client: DMs to team members and Minutes transcript
// pulls for the coaching cycle. Distinct from kernel/messaging/lark.ts (incoming webhooks
// to group channels) — this one authenticates as the Edge8 Lark app and can
// message individuals and read Minutes.
//
// FAIL-SOFT EVERYWHERE: when LARK_APP_ID / LARK_APP_SECRET are unset, or a
// call fails, or a scope is missing, functions return false/null/[] and log.
// Email remains the delivery guarantee (the cron sends both channels).
//
// Required app scopes (grant in the Lark developer console):
//   im:message              — send DMs
//   contact:user.id:readonly — resolve open_id by primary email
//   contact:user.base:readonly, contact:department.base:readonly
//                           — walk the directory for the people whose address
//                             Lark holds only as enterprise_email
//   minutes:minutes:readonly — read Minutes meta + transcript
// The Minutes LIST endpoint is NOT served to this tenant app: it answers a
// plain-text HTTP 404, confirmed 2026-09-22, so this client never lists
// recordings. A recording reaches it as a token: a coach pastes its Minutes
// link onto the 1-1, and the 22:00 coaching-lark-pickup job reads the
// transcript by that token each night until it is loaded (K.73), here when the
// coach has not connected their own Lark account. Lark answers "permission
// deny" until the recording's owner shares it with the app. The transcript
// reader's own log lines do not carry the token (the transport's network-error
// line still logs the request path).

import { heldInShadow } from "@/kernel/audit/run-context";
import { larkDmOptedOut } from "./dm-preference";
import { larkConfigured, larkFetch, readJson } from "./lark-transport";
import { logLarkMessage } from "./lark-log";
import type { LarkMessage, SendOutcome } from "./lark";
import type { MessageCategory } from "./message-category";

// The transport lives next door so the calendar client can share it; this
// module keeps the name callers already import it by.
export { larkConfigured };

// open_id by the address Lark calls primary. This is the documented lookup and
// it answers for most people in one call — but only for people who have a
// primary address at all, which is why it is a fast path and not the answer.
async function openIdByPrimaryEmail(email: string): Promise<string | null> {
  const path = "/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id";
  const res = await larkFetch(path, {
    method: "POST",
    body: JSON.stringify({ emails: [email] }),
  });
  if (!res) return null;
  const json = await readJson<{
    code: number;
    msg?: string;
    data?: { user_list?: Array<{ email?: string; user_id?: string }> };
  }>(res, path);
  if (!json) return null;
  if (json.code !== 0) {
    console.error("[lark-api] batch_get_id failed:", json.code, json.msg);
    return null;
  }
  return json.data?.user_list?.find((u) => u.user_id)?.user_id ?? null;
}

// Lark holds two addresses for a person — `email` (primary) and
// `enterprise_email` — and `batch_get_id` matches only the first. Against this
// tenant on 2026-09-22, 14 of 43 people had no primary address at all and every
// one of the 43 had an enterprise one, so the lookup above returned null for a
// third of the company and `sendLarkDm` skipped them with a warning nobody
// read. The directory is the other field: the whole tenant indexed by both
// addresses, which is the only complete answer Lark offers a tenant app.
//
// Two traps, both found by probing rather than by reading. The root department
// holds 32 of the 43, so walking `department_id=0` alone still misses eleven
// people; the tree has to be flattened first. And a department page costs its
// own call — twenty against this tenant — so the result is cached in process,
// exactly like the tenant token above. A staff directory changes a few times a
// year; ten minutes is already generous.
const DIRECTORY_TTL_MS = 10 * 60_000;
let directory: { byAddress: Map<string, string>; expiresAt: number } | null = null;

/**
 * Drop the cached tenant directory. Exists for the tests, which stub a fresh
 * `fetch` per case and would otherwise read the previous case's directory.
 */
export function resetLarkDirectory(): void {
  directory = null;
}

// Every department in the tenant, the root included. `fetch_child` flattens the
// tree into one page, and the root is not listed among its own children.
async function departmentIds(): Promise<string[] | null> {
  const ids = ["0"];
  let pageToken: string | null = null;
  do {
    const path: string = `/open-apis/contact/v3/departments/0/children?fetch_child=true&department_id_type=open_department_id&page_size=50${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await larkFetch(path, { method: "GET" });
    if (!res) return null;
    const json = await readJson<{
      code: number;
      msg?: string;
      data?: { items?: Array<{ open_department_id?: string }>; has_more?: boolean; page_token?: string };
    }>(res, path);
    if (!json) return null;
    if (json.code !== 0) {
      console.error("[lark-api] department list failed:", json.code, json.msg);
      return null;
    }
    for (const d of json.data?.items ?? []) if (d.open_department_id) ids.push(d.open_department_id);
    pageToken = json.data?.has_more ? (json.data.page_token ?? null) : null;
  } while (pageToken);
  return ids;
}

// The tenant indexed by every address it holds, lowercased. Null — not an empty
// map — when the walk could not complete, so a caller can tell "this person is
// not in the directory" from "there is no directory to look in".
async function larkDirectory(): Promise<Map<string, string> | null> {
  if (directory && Date.now() < directory.expiresAt) return directory.byAddress;
  const departments = await departmentIds();
  if (!departments) return null;

  // One call per department, and this tenant has nineteen. Walked one after
  // another that is eight and a half seconds of cold start, which is fine in a
  // cron and not fine in a request that is sending somebody a DM. Departments
  // are independent, so they go together; pages within a department still have
  // to follow each other, because each one names the next.
  const perDepartment = await Promise.all(departments.map((id) => usersInDepartment(id)));
  if (perDepartment.some((users) => users === null)) return null;

  const byAddress = new Map<string, string>();
  for (const users of perDepartment) {
    for (const u of users ?? []) {
      if (!u.open_id) continue;
      for (const address of [u.email, u.enterprise_email]) {
        if (address) byAddress.set(address.trim().toLowerCase(), u.open_id);
      }
    }
  }

  directory = { byAddress, expiresAt: Date.now() + DIRECTORY_TTL_MS };
  return byAddress;
}

type TenantUser = { open_id?: string; email?: string; enterprise_email?: string };

// Everyone in one department, following its pages. Null on any failure, which
// the caller turns into "there is no directory" rather than a partial one — a
// half-read directory would answer "nobody is at that address" about somebody
// whose department simply failed to load, which is the exact wrong answer this
// whole change exists to stop giving.
async function usersInDepartment(id: string): Promise<TenantUser[] | null> {
  const users: TenantUser[] = [];
  let pageToken: string | null = null;
  do {
    const path: string = `/open-apis/contact/v3/users/find_by_department?department_id=${encodeURIComponent(id)}&department_id_type=open_department_id&user_id_type=open_id&page_size=50${pageToken ? `&page_token=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await larkFetch(path, { method: "GET" });
    if (!res) return null;
    const json = await readJson<{
      code: number;
      msg?: string;
      data?: { items?: TenantUser[]; has_more?: boolean; page_token?: string };
    }>(res, path);
    if (!json) return null;
    if (json.code !== 0) {
      console.error("[lark-api] department users failed:", json.code, json.msg);
      return null;
    }
    users.push(...(json.data?.items ?? []));
    pageToken = json.data?.has_more ? (json.data.page_token ?? null) : null;
  } while (pageToken);
  return users;
}

// open_id by any address Lark holds for the person. Null means one of two
// different things and the log line says which: the tenant has nobody at this
// address, or the directory could not be read at all.
export async function larkOpenIdByEmail(email: string): Promise<string | null> {
  const primary = await openIdByPrimaryEmail(email);
  if (primary) return primary;

  const byAddress = await larkDirectory();
  if (!byAddress) {
    console.error(`[lark-api] directory unavailable; cannot resolve ${email}`);
    return null;
  }
  const openId = byAddress.get(email.trim().toLowerCase()) ?? null;
  if (!openId) console.warn(`[lark-api] no tenant user at ${email} (${byAddress.size} in the directory)`);
  return openId;
}

// Plain-text DM to a team member by email. False (and a log line) on any miss.
export async function sendLarkDm(
  email: string | null,
  text: string,
  opts?: { category?: MessageCategory },
): Promise<boolean> {
  // A routine in shadow mode sends nothing (Z.17); the run's log says what it held back.
  if (heldInShadow("lark-dm", `a text DM (${opts?.category ?? "other"})`)) return false;
  return (await deliverDm(email, text, opts?.category ?? "other", { honourOptOut: true })).ok;
}

/**
 * A DM, text or card, that says what became of it (Z.7): the notification
 * router's way in, because a DM Lark refused fails a routine step while one to
 * a person who opted out of DMs does not. The opt-out is always honoured here.
 */
export async function deliverLarkDm(email: string, message: LarkMessage, opts?: { category?: MessageCategory }): Promise<SendOutcome> {
  const kind = typeof message === "string" ? "text" : "card";
  if (heldInShadow(kind === "text" ? "lark-dm" : "lark-card", `a ${kind} DM (${opts?.category ?? "other"})`)) {
    return { ok: false, declined: true, reason: "held back in a shadow run" };
  }
  return deliverDm(email, message, opts?.category ?? "other", { honourOptOut: true });
}

// The one DM path. sendLarkCard has never read the opt-out (it predates it),
// so it asks for the old behaviour by name rather than changing what its
// callers send in a change about the router; the router always honours it.
async function deliverDm(
  email: string | null,
  message: LarkMessage,
  category: MessageCategory,
  { honourOptOut }: { honourOptOut: boolean },
): Promise<SendOutcome> {
  if (!email) return { ok: false, declined: false, reason: "no address" };
  if (!larkConfigured()) return { ok: false, declined: false, reason: "the Lark app is not configured (LARK_APP_ID, LARK_APP_SECRET)" };
  // A person who declined DMs is skipped here, before any Lark call, so the
  // preference holds for every caller. Their email still goes out.
  if (honourOptOut && (await larkDmOptedOut(email))) return { ok: false, declined: true, reason: "the recipient opted out of Lark DMs" };
  const isText = typeof message === "string";
  const openId = await larkOpenIdByEmail(email);
  if (!openId) {
    console.warn(`[lark-api] no open_id for ${email}; ${isText ? "DM" : "card"} skipped`);
    return { ok: false, declined: false, reason: "no Lark user at that address, or the directory could not be read" };
  }
  const path = "/open-apis/im/v1/messages?receive_id_type=open_id";
  const res = await larkFetch(path, {
    method: "POST",
    body: JSON.stringify({
      receive_id: openId,
      msg_type: isText ? "text" : "interactive",
      content: JSON.stringify(isText ? { text: message } : message.card),
    }),
  });
  const logged = isText ? message : { card: message.card };
  // A send Lark refused or that never answered is logged as failed (Y.43).
  if (!res) {
    await logLarkMessage({ message: logged, category, source: "lark_dm", email, failed: "no response from Lark" });
    return { ok: false, declined: false, reason: "no response from Lark" };
  }
  // Lark answers a refused message with HTTP 200 and a non-zero code, so the
  // body decides, never the status alone.
  const json = await readJson<{ code: number; msg?: string }>(res, path);
  if (!json || json.code !== 0) {
    if (json) console.error(`[lark-api] ${isText ? "DM" : "card send"} failed:`, json.code, json.msg);
    const reason = json ? `code ${json.code} ${json.msg ?? ""}`.trim() : "unreadable response";
    await logLarkMessage({ message: logged, category, source: "lark_dm", email, failed: reason });
    return { ok: false, declined: false, reason };
  }
  await logLarkMessage({ message: logged, category, source: "lark_dm", email });
  return { ok: true };
}

// The email Lark holds for an open_id. This is the inbound direction of
// larkOpenIdByEmail: a card tap tells us who tapped only as an open_id, and the
// only identity our own tables share with Lark is the email address.
export async function larkEmailByOpenId(openId: string): Promise<string | null> {
  const path = `/open-apis/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`;
  const res = await larkFetch(path, { method: "GET" });
  if (!res) return null;
  const json = await readJson<{
    code: number;
    msg?: string;
    data?: { user?: { email?: string; enterprise_email?: string } };
  }>(res, path);
  if (!json) return null;
  if (json.code !== 0) {
    console.error("[lark-api] user lookup failed:", json.code, json.msg);
    return null;
  }
  // A tenant may hold only the work address, only the personal one, or both.
  const user = json.data?.user;
  return user?.email || user?.enterprise_email || null;
}

// An interactive card DM to a team member by email. Same fail-soft contract as
// sendLarkDm: false and a log line on any miss, never a throw.
export async function sendLarkCard(
  email: string | null,
  card: Record<string, unknown>,
  opts?: { category?: MessageCategory },
): Promise<boolean> {
  if (heldInShadow("lark-card", `a card DM (${opts?.category ?? "other"})`)) return false;
  return (await deliverDm(email, { card }, opts?.category ?? "other", { honourOptOut: false })).ok;
}

/**
 * Why a transcript could not be read. The distinction is the point: for months
 * every one of these was reported to the coach as "no transcript yet, try again
 * later", so a recording the app is not ALLOWED to read looked exactly like one
 * Lark had not finished writing. That sent us hunting a timing bug that did not
 * exist (2026-09-22).
 *
 * - `denied`      — Lark says permission deny (2091005). The recording exists
 *                   and the app may not read it. Retrying never helps; somebody
 *                   has to share it, or the app needs tenant-level access.
 * - `not-ready`   — Lark answered, but there is no text yet. This one IS worth
 *                   retrying: the daily cycle picks it up.
 * - `unavailable` — the endpoint is not served, the body was not JSON, or the
 *                   call failed. Also worth retrying, but it is not about
 *                   permission and should not be reported as if it were.
 */
export type MinutesFailure = "denied" | "not-ready" | "unavailable";

export type MinutesTranscript =
  | { ok: true; transcript: string }
  | { ok: false; reason: MinutesFailure };

/** Lark's "you may not read this object" for Minutes. */
const MINUTES_PERMISSION_DENIED = 2091005;

/**
 * When a recording started, as an ISO timestamp, read as the app. Null when the
 * app may not read it or Lark does not say; a caller treats that as "date
 * unknown", never as a failure, because the transcript is what matters.
 */
export async function fetchMinuteStartedAt(token: string): Promise<string | null> {
  const path = `/open-apis/minutes/v1/minutes/${encodeURIComponent(token)}`;
  const res = await larkFetch(path, { method: "GET" });
  if (!res) return null;
  const json = await readJson<{ code: number; data?: { minute?: { create_time?: string | number } } }>(res, path);
  if (!json || json.code !== 0) return null;
  const ms = Number(json.data?.minute?.create_time);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;
}

// The app's display name, as people see it in Lark's share dialog. Kept for
// the life of the process once read: it changes only when somebody renames
// the app. A failed read is not kept, so the next call asks again.
let appName: string | null = null;

/**
 * The name to search for when sharing a recording with the app, so a message
 * can say exactly whom to share it with. Null when Lark does not answer; the
 * caller then names it generically. Read at run time rather than written into
 * the code, because a fork's app has a different name.
 */
export async function larkAppName(): Promise<string | null> {
  if (appName) return appName;
  const path = "/open-apis/bot/v3/info";
  const res = await larkFetch(path, { method: "GET" });
  if (!res) return null;
  const json = await readJson<{ code: number; bot?: { app_name?: string } }>(res, path);
  appName = json && json.code === 0 ? json.bot?.app_name?.trim() || null : null;
  return appName;
}

/** Drop the cached app name. Exists for the tests. */
export function resetLarkAppName(): void {
  appName = null;
}

export async function fetchMinutesTranscript(token: string): Promise<MinutesTranscript> {
  const path = `/open-apis/minutes/v1/minutes/${token}/transcript?need_speaker=true&need_timestamp=false&file_format=txt`;
  const res = await larkFetch(path, { method: "GET" });
  if (!res) return { ok: false, reason: "unavailable" };

  // Success returns the file stream; error bodies are JSON with a code.
  const text = await res.text();
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as { code?: number; msg?: string };
      if (json.code === MINUTES_PERMISSION_DENIED) {
        console.error(`[lark-api] transcript: permission deny — the app cannot read this recording`);
        return { ok: false, reason: "denied" };
      }
      if (json.code) {
        console.error(`[lark-api] transcript failed:`, json.code, json.msg);
        return { ok: false, reason: "unavailable" };
      }
    } catch {
      /* not JSON — treat as transcript text */
    }
  }
  if (!res.ok) {
    console.error(`[lark-api] transcript failed: HTTP ${res.status}`);
    return { ok: false, reason: "unavailable" };
  }
  const body = text.trim();
  return body ? { ok: true, transcript: body } : { ok: false, reason: "not-ready" };
}
