import { companyOs } from "@/kernel/data/supabase";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import type { MessageCategory } from "@/kernel/messaging/message-category";
import { redactSignInLinks } from "@/kernel/messaging/sign-in-links";

// Every Lark message the app delivers is logged to company_os.interactions as
// kind "lark", the way email.ts logs every accepted email, so one table answers
// "what did we send, to whom, when, about what" across channels (Dave,
// 2026-10-05). Best-effort like the email log: a failed insert is logged and
// never turns a delivered message into a failure.
//
// A direct message joins the recipient's timeline. A post to a group chat has
// no single recipient, so it names its chat in metadata.chat instead, which
// interactions_check accepts for lark and whatsapp rows only (migration
// 20261005120000). A direct message to an address with no person in the CRM
// has no timeline to join and gets no row, as email does.
//
// A send Lark refused, or that threw, is logged too, with metadata.failed
// saying why (Y.43): until then failures left no row, so the per-chat timeline
// showed only what got through. Every logged body has its sign-in links
// removed, as the email log does: a magic link in a log is a credential.

type Logged = string | { card: Record<string, unknown> };

/** The first line of a text, or a card's header title, cut to a subject's length. */
function subjectOf(message: Logged): string {
  if (typeof message === "string") return message.split("\n")[0].slice(0, 160);
  const header = message.card.header as { title?: { content?: unknown } } | undefined;
  const title = header?.title?.content;
  return typeof title === "string" && title ? title.slice(0, 160) : "Lark card";
}

export async function logLarkMessage(opts: {
  message: Logged;
  category: MessageCategory;
  source: string;
  /** The group chat a webhook posts to. */
  chat?: string;
  /** The recipient of a direct message. */
  email?: string;
  /** Why the send failed; absent for a delivered message. */
  failed?: string;
}): Promise<void> {
  try {
    let personId: string | null = null;
    if (opts.email) {
      personId = await personIdForEmail(opts.email);
      if (!personId) {
        console.info(`[lark] not logged: a direct message (source ${opts.source}) went to someone with no CRM person`);
        return;
      }
    }
    const { error } = await companyOs.from("interactions").insert({
      kind: "lark",
      category: opts.category,
      subject: redactSignInLinks(subjectOf(opts.message)),
      body: redactSignInLinks(typeof opts.message === "string" ? opts.message : JSON.stringify(opts.message.card)),
      person_id: personId,
      occurred_at: new Date().toISOString(),
      metadata: {
        source: opts.source,
        sent_by: "app",
        ...(opts.chat ? { chat: opts.chat } : {}),
        ...(opts.email ? { to: opts.email.trim().toLowerCase() } : {}),
        ...(opts.failed ? { failed: opts.failed.slice(0, 300) } : {}),
      },
    });
    if (error) console.error("[lark] interaction log failed:", error.message);
  } catch (err) {
    console.error("[lark] interaction log failed:", err instanceof Error ? err.message : err);
  }
}
