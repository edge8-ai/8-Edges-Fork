// Lark webhook notifications.

import { heldInShadow } from "@/kernel/audit/run-context";
import { logLarkMessage } from "@/kernel/messaging/lark-log";
import type { MessageCategory } from "@/kernel/messaging/message-category";

/**
 * Post one text message to a Lark custom-bot webhook. Returns whether Lark
 * accepted it.
 *
 * The return value exists because a Lark webhook answers a rejected message
 * with HTTP 200 and a non-zero `code` in the body — a missing bot, a revoked
 * webhook and a wrong signature all look like a clean send to anything that
 * only awaits the fetch. The Daily Check-in Agent ran "ok" for three mornings
 * on that basis while nothing reached either chat (2026-09-11), so the body is
 * now read and a rejection is both logged and reported to the caller.
 */
/**
 * What a sender can post: plain text, or a Lark interactive card. The card is
 * for reports that carry lists and links (the Daily Check-in), which read as a
 * wall of text in a text message and cannot link anything.
 */
export type LarkMessage = string | { card: Record<string, unknown> };

/**
 * What a send came to, for the notification router (Z.7), which has to tell a
 * send that did not land from one nobody was meant to receive. `declined` is
 * the second kind, and it is narrow: a person who opted out of Lark DMs, or a
 * send held back in a shadow run. Everything else that did not land is a
 * failure the router turns into a failed step, an unset webhook included,
 * because a webhook nobody set is how a silent chat went unnoticed for weeks
 * (blog-publish, Y.20). The boolean senders below keep their old "no-op when
 * unset" meaning for the callers not on the router yet.
 */
export type SendOutcome = { ok: true } | { ok: false; declined: boolean; reason: string };

/**
 * Which chat a webhook reaches, and what its posts are about unless the caller
 * says otherwise. The Operations chat carries several kinds of notice, so its
 * default is "other" and the callers that know better pass a category.
 */
type Chat = { chat: string; category: MessageCategory };
type SendOptions = { category?: MessageCategory };

async function postLark(url: string, message: LarkMessage, to: Chat, opts?: SendOptions): Promise<SendOutcome> {
  // A routine in shadow mode posts nothing (Z.17), to any chat, Operations
  // included: an ops notice a routine's work sends is part of what it would
  // have done. The one ops post that goes out in shadow is the alert about the
  // run's own repeated failure, on the outsideShadow allowlist in routine-runs.ts.
  // The run's log says what was held back; the caller hears "not delivered".
  const category = opts?.category ?? to.category;
  if (heldInShadow("lark", `a ${typeof message === "string" ? "text" : "card"} post to the ${to.chat} chat (${category})`)) {
    return { ok: false, declined: true, reason: "held back in a shadow run" };
  }
  const sent = await deliver(url, message);
  // Delivered or not, the post is logged; a failure says why (Y.43).
  await logLarkMessage({
    message,
    category,
    source: `lark_webhook:${to.chat}`,
    chat: to.chat,
    ...(sent.ok ? {} : { failed: sent.reason }),
  });
  return sent.ok ? sent : { ok: false, declined: false, reason: sent.reason };
}

async function deliver(url: string, message: LarkMessage): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        typeof message === "string"
          ? { msg_type: "text", content: { text: message } }
          : { msg_type: "interactive", card: message.card },
      ),
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error(`[lark] send rejected: HTTP ${res.status} ${raw.slice(0, 200)}`);
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    // Lark answers `{"code":0,"msg":"success"}`; older deployments answer
    // `{"StatusCode":0,...}`. Either zero means delivered. A body we cannot
    // parse is not treated as a failure — the known rejection shape is JSON,
    // and failing on an unreadable 200 would block sends on a format change.
    let body: Record<string, unknown> | null = null;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.warn(`[lark] send returned a non-JSON body: ${raw.slice(0, 200)}`);
      return { ok: true };
    }
    const code = typeof body?.code === "number" ? body.code : body?.StatusCode;
    if (typeof code === "number" && code !== 0) {
      const msg = String(body?.msg ?? body?.StatusMessage ?? "");
      console.error(`[lark] send rejected: code ${code} ${msg}`);
      return { ok: false, reason: `code ${code} ${msg}`.trim() };
    }
    return { ok: true };
  } catch (err) {
    console.error("[lark] send failed", err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// Coaching channel — reuses the CAIO Coach incoming webhook
// (LARK_COACHING_WEBHOOK_URL). No-ops when unset. Takes a card as well as
// text since the group-coaching ingest posts a summary with a link, which a
// text message cannot carry.
export async function sendLarkMessage(message: LarkMessage, opts?: SendOptions): Promise<boolean> {
  const url = process.env.LARK_COACHING_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_COACHING_WEBHOOK_URL not set; skipping");
    return false;
  }
  return (await postLark(url, message, { chat: "coaching", category: "one_on_one" }, opts)).ok;
}

// Operations chat (LARK_OPS_WEBHOOK_URL). What belongs here, as Dave set it on
// 2026-09-15: the daily check-in and its reminder, money (orders, payments,
// client invoicing), forms (contact, careers, retreats, surveys), requests
// (time off, hires, work) and the daily digests and QuickBooks syncs. Marketing
// goes to notifyMarketing and coaching to sendLarkMessage: this webhook sat
// unset for months, and the day it was set every marketing notice landed in
// the Operations team chat. No-ops when unset.
export async function notifyOps(message: LarkMessage, opts?: SendOptions): Promise<boolean> {
  const url = process.env.LARK_OPS_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_OPS_WEBHOOK_URL not set; skipping ops notice");
    return false;
  }
  return (await postLark(url, message, { chat: "ops", category: "other" }, opts)).ok;
}

// The Revenue chat (LARK_MARKETING_WEBHOOK_URL; the chat was called Marketing
// until 2026-09-19 and the variable kept the old name): the per-broadcast
// summaries, the monthly recap, the marketing digest, blog publishing, the
// writer and letter agents' notices, the month-end revenue digest, and the
// Revenue board's sprint and closed-card posts. It takes a card as well as
// text because the board posts link each card. No-ops when unset, so a
// routine still records a clean run before the webhook is configured.
export async function notifyMarketing(message: LarkMessage, opts?: SendOptions): Promise<boolean> {
  const url = process.env.LARK_MARKETING_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_MARKETING_WEBHOOK_URL not set; skipping revenue chat notice");
    return false;
  }
  return (await postLark(url, message, { chat: "revenue", category: "marketing" }, opts)).ok;
}

// The product-team chat and the community chat — the Daily Check-in Agent's
// two destinations (LARK_PRODUCT_WEBHOOK_URL, LARK_EO_WEBHOOK_URL). An unset
// variable returns false rather than no-opping quietly: the check-in run turns
// that into a failed run naming the roster, because a check-in nobody receives
// is not a check-in.
export async function notifyProduct(message: LarkMessage, opts?: SendOptions): Promise<boolean> {
  const url = process.env.LARK_PRODUCT_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_PRODUCT_WEBHOOK_URL not set; skipping product notice");
    return false;
  }
  return (await postLark(url, message, { chat: "product", category: "workboard" }, opts)).ok;
}

export async function notifyEo(message: LarkMessage, opts?: SendOptions): Promise<boolean> {
  const url = process.env.LARK_EO_WEBHOOK_URL;
  if (!url) {
    console.warn("[lark] LARK_EO_WEBHOOK_URL not set; skipping EO notice");
    return false;
  }
  return (await postLark(url, message, { chat: "eo", category: "workboard" }, opts)).ok;
}


/** The group chats a notice can be posted to, by the name the router and the log use. */
export const LARK_CHATS = {
  ops: { env: "LARK_OPS_WEBHOOK_URL", category: "other" },
  revenue: { env: "LARK_MARKETING_WEBHOOK_URL", category: "marketing" },
  product: { env: "LARK_PRODUCT_WEBHOOK_URL", category: "workboard" },
  eo: { env: "LARK_EO_WEBHOOK_URL", category: "workboard" },
  coaching: { env: "LARK_COACHING_WEBHOOK_URL", category: "one_on_one" },
} as const satisfies Record<string, { env: string; category: MessageCategory }>;

export type LarkChat = keyof typeof LARK_CHATS;

/**
 * Post to one of the group chats and say what became of it (Z.7). The router
 * calls this instead of the boolean senders above, because it needs the
 * reason: Lark's refusal (HTTP 200 with a non-zero code), the HTTP status, or
 * the variable that is not set.
 */
export async function postToChat(chat: LarkChat, message: LarkMessage, opts?: SendOptions): Promise<SendOutcome> {
  const { env, category } = LARK_CHATS[chat];
  const url = process.env[env];
  if (!url) {
    console.warn(`[lark] ${env} not set; skipping ${chat} notice`);
    return { ok: false, declined: false, reason: `${env} is not set` };
  }
  return postLark(url, message, { chat, category }, opts);
}
