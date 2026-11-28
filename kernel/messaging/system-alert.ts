// Broken: an engineer must fix it (the Lark notifications plan, 2026-11-18).
// A failed routine, the watchdog, a token near expiry. These never go to an
// office chat: each one is a direct message to the people who watch the
// system, named in LARK_SYSTEM_ALERT_EMAILS (comma-separated). With the
// variable unset the alert reaches nobody in Lark and the caller hears so;
// Settings -> Agents still shows every failed run.

import { deliverLarkDm } from "@/kernel/messaging/lark-api";
import type { LarkMessage, SendOutcome } from "@/kernel/messaging/lark";

/** The addresses that receive system alerts. */
export function systemAlertEmails(): string[] {
  return (process.env.LARK_SYSTEM_ALERT_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Send one alert to every watcher. Lands when it reached at least one of them. */
export async function alertSystem(message: LarkMessage): Promise<SendOutcome> {
  const emails = systemAlertEmails();
  if (emails.length === 0) return { ok: false, declined: false, reason: "LARK_SYSTEM_ALERT_EMAILS is not set" };
  const outcomes = await Promise.all(emails.map((email) => deliverLarkDm(email, message, { category: "other" })));
  if (outcomes.some((o) => o.ok)) return { ok: true };
  return outcomes[0];
}
