// The notification router (Z.7, Automation Plan B1/D): the one way a routine
// sends a Lark notice. A caller names a kind from the registry below, who it
// is for, the message and a dedupe key; the router decides when it goes:
//
// - an urgent notice (every ops alert) goes now, whatever the hour;
// - an immediate kind goes now in working hours, and in quiet hours (outside
//   weekday 08:30 to 18:00 Saigon time) it is held in
//   company_os.notification_queue until the next working morning;
// - a digest kind is queued for its recipient's one message on the next
//   working morning (notification-flush.ts sends both).
//
// Every send claims the dedupe key in the effect ledger first (kernel/audit
// once()), so a retried step, a second Run-now or a repeated call never sends
// twice, and a run in shadow mode records what it would have sent instead of
// sending or queuing anything (Z.17).
//
// A failed send is a failure the caller turns into a failed step (failureOf),
// because a Lark rejection arrives as HTTP 200 with a non-zero code and a
// sender that only awaited the fetch reported it as delivered (2026-09-11). An
// unset webhook is a failure too. A declined send, to a person who opted out
// of Lark DMs, is not: they asked not to receive it.
//
// The in-app inbox (company_os.notifications) is a page a person chooses to
// open and is never pushed from here.
import { once } from "@/kernel/audit/effects";
import { currentRunMode } from "@/kernel/audit/run-context";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { companyOs } from "@/kernel/data/supabase";
import type { Json } from "@/kernel/data/supabase/database.types";
import { personIdForEmail } from "@/kernel/identity/person-by-email";
import { inQuietHours, nextWorkingMorning } from "./business-hours";
import { LARK_CHATS, postToChat, type LarkChat, type LarkMessage, type SendOutcome } from "./lark";
import { deliverLarkDm } from "./lark-api";
import type { MessageCategory } from "./message-category";
import { redactSignInLinks } from "./sign-in-links";

export type Urgency = "normal" | "urgent";
type KindSpec = { delivery: "immediate" | "digest"; urgency: Urgency; about: string };

/**
 * Every kind of notice the router sends, and whether it goes at once or in the
 * morning digest. Org-level configuration: there is no per-person setting,
 * which would be a design change for Khoa to approve first. A kind's urgency
 * is its default; a caller may raise one notice to urgent.
 */
export const NOTICE_KINDS = {
  "ops.alert": {
    delivery: "immediate",
    urgency: "urgent",
    about: "Something broke or is about to and a person must act: a failed sync, a token near expiry, broken invariants. Never held.",
  },
  "ops.digest": {
    delivery: "digest",
    urgency: "normal",
    about: "Operations news that can wait for the morning, such as the key results an overnight sync moved.",
  },
  "revenue.weekly-pulse": {
    delivery: "immediate",
    urgency: "normal",
    about: "The Revenue chat's weekly marketing pulse.",
  },
  // Z.7.1: three Revenue chat posts that fired outside working hours (the
  // closed cards at 18:00 every day, the digest and the blog notice at the
  // weekend too) now wait for the next working window like the pulse.
  "revenue.closed-cards": {
    delivery: "immediate",
    urgency: "normal",
    about: "The Revenue chat's end-of-day list of cards closed on the boards that report to it.",
  },
  "revenue.marketing-digest": {
    delivery: "immediate",
    urgency: "normal",
    about: "The Revenue chat's daily reminder of blog, LinkedIn and Facebook posts due to go out by hand.",
  },
  "revenue.blog-published": {
    delivery: "immediate",
    urgency: "normal",
    about: "The Revenue chat's notice of scheduled blog posts put live, and of any that could not be.",
  },
} as const satisfies Record<string, KindSpec>;

export type NoticeKind = keyof typeof NOTICE_KINDS;

/** A person by their email address, or one of the group chats. */
export type NoticeTo = { person: string } | { chat: LarkChat };

export type NotifyInput = {
  kind: NoticeKind;
  to: NoticeTo;
  message: LarkMessage;
  /** One line the digest lists and the shadow record names; defaults to the text's first line or the card's title. */
  subject?: string;
  /** "<entity>:<notice>:<subject>[:<period>]", ids only: the effect ledger key, and the queue's. */
  dedupeKey: string;
  urgency?: Urgency;
  category?: MessageCategory;
};

export type NotifyResult =
  | { status: "sent" }
  | { status: "held"; until: string }
  | { status: "queued"; until: string }
  | { status: "duplicate"; reason: string }
  | { status: "shadow"; reason: string }
  | { status: "declined"; reason: string }
  | { status: "failed"; error: string };

/**
 * The failure a routine step reports for a notice that did not go, or none.
 * Held, queued, duplicate, shadow and declined notices are not failures.
 */
export function failureOf(result: NotifyResult, subject: string, step: string): RoutineFailure[] {
  return result.status === "failed" ? [{ subject, step, error: result.error }] : [];
}

/** Send, hold or queue one notice (see the top of this file). `now` is for the tests. */
export async function notify(input: NotifyInput, now: Date = new Date()): Promise<NotifyResult> {
  const spec: KindSpec | undefined = NOTICE_KINDS[input.kind];
  if (!spec) return { status: "failed", error: `unknown notice kind ${String(input.kind)}` };
  if (!input.dedupeKey.trim() || input.dedupeKey.startsWith("shadow:")) {
    return { status: "failed", error: `notice ${input.kind}: a dedupe key is required and may not start with shadow:` };
  }
  const urgency = input.urgency ?? spec.urgency;
  const plan = urgency === "urgent" ? "send" : spec.delivery === "digest" ? "digest" : inQuietHours(now) ? "held" : "send";
  if (currentRunMode() === "shadow") return recordInShadow(input, plan, now);
  if (plan !== "send") {
    const queued = await enqueue(input, plan, urgency, nextWorkingMorning(now));
    if (queued) return queued;
  }
  return sendNow(input);
}

/** Where a notice goes, by channel. The flush sends queued rows through this too. */
export function deliverNotice(to: NoticeTo, message: LarkMessage, category?: MessageCategory): Promise<SendOutcome> {
  return "chat" in to ? postToChat(to.chat, message, category ? { category } : undefined) : deliverLarkDm(to.person, message, { category });
}

/**
 * Who a notice is for, in words a shadow record may carry: a chat by name, a
 * person never by address, because a shadow summary is read on Settings ->
 * Agents and must hold no personal data.
 */
export function describeTo(to: NoticeTo): string {
  return "chat" in to ? `the ${to.chat} chat` : "a person (Lark DM)";
}

/** The one line a notice is listed by: the caller's subject, the text's first line, or the card's title. */
export function subjectOf(message: LarkMessage, subject?: string): string {
  if (subject?.trim()) return subject.trim().slice(0, 160);
  if (typeof message === "string") return message.split("\n")[0].trim().slice(0, 160) || "Notice";
  const title = (message.card.header as { title?: { content?: unknown } } | undefined)?.title?.content;
  return typeof title === "string" && title.trim() ? title.trim().slice(0, 160) : "Lark card";
}

async function recordInShadow(input: NotifyInput, plan: "send" | "held" | "digest", now: Date): Promise<NotifyResult> {
  const when =
    plan === "send" ? "sent now" : plan === "held" ? `held until ${nextWorkingMorning(now).toISOString()}` : "queued for the morning digest";
  // In shadow once() never calls the act; it records the summary instead.
  const r = await once(input.dedupeKey, "lark", async () => ({ ok: false, error: "a shadow run never sends" }), {
    summary: `Lark ${input.kind} notice to ${describeTo(input.to)}, ${when}: ${subjectOf(input.message, input.subject)}`,
    detail: { kind: input.kind, plan },
  });
  return { status: "shadow", reason: r.acted ? "recorded" : r.reason };
}

/**
 * Queue a held or digest notice. Null means it could not be queued and is to
 * be sent now instead: a notice that arrives at night is better than one that
 * never arrives, which is the same choice once() makes when its ledger is down.
 * A message carrying a sign-in link is never queued either, because a queued
 * body is stored and that link is a credential until it is used.
 */
async function enqueue(input: NotifyInput, reason: "held" | "digest", urgency: Urgency, until: Date): Promise<NotifyResult | null> {
  const body = typeof input.message === "string" ? input.message : JSON.stringify(input.message.card);
  if (redactSignInLinks(body) !== body) {
    console.warn(`[router] ${input.dedupeKey}: carries a sign-in link, so it is sent now rather than queued`);
    return null;
  }
  let personId: string | null = null;
  if ("person" in input.to) {
    // The person is only the join to the timeline; a failed lookup loses that and nothing else.
    personId = await personIdForEmail(input.to.person).catch((err: unknown) => {
      console.error(`[router] ${input.dedupeKey}: person lookup failed:`, err instanceof Error ? err.message : err);
      return null;
    });
  }
  const message: Json = typeof input.message === "string" ? { text: input.message } : { card: input.message.card as Json };
  const { data, error } = await companyOs
    .from("notification_queue")
    .upsert(
      {
        kind: input.kind,
        channel: "chat" in input.to ? "lark_chat" : "lark_dm",
        recipient: "chat" in input.to ? input.to.chat : input.to.person.trim().toLowerCase(),
        person_id: personId,
        subject: subjectOf(input.message, input.subject),
        message,
        urgency,
        reason,
        dedupe_key: input.dedupeKey,
        deliver_after: until.toISOString(),
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    console.error(`[router] ${input.dedupeKey}: the queue could not be written, sending now: ${error.message}`);
    return null;
  }
  if (!data || data.length === 0) return { status: "duplicate", reason: `${input.dedupeKey} is already queued` };
  return reason === "held" ? { status: "held", until: until.toISOString() } : { status: "queued", until: until.toISOString() };
}

async function sendNow(input: NotifyInput): Promise<NotifyResult> {
  // A holder rather than a let, because the act runs inside once() and its
  // assignment is invisible to the narrowing after the await.
  const seen: { declined: string | null } = { declined: null };
  const r = await once(
    input.dedupeKey,
    "lark",
    async () => {
      const out = await deliverNotice(input.to, input.message, input.category);
      if (out.ok) return { ok: true };
      // A declined send releases the key like a failure, so a later notice
      // under the key can still go if the person opts back in; only the
      // caller's verdict differs.
      if (out.declined) seen.declined = out.reason;
      return { ok: false, error: out.reason };
    },
    { summary: `Lark ${input.kind} notice to ${describeTo(input.to)}: ${subjectOf(input.message, input.subject)}`, detail: { kind: input.kind } },
  );
  if (!r.acted) return r.shadow ? { status: "shadow", reason: r.reason } : { status: "duplicate", reason: r.reason };
  if (r.outcome.ok) return { status: "sent" };
  if (seen.declined) return { status: "declined", reason: seen.declined };
  return { status: "failed", error: r.outcome.error };
}

/** Whether a queued row names a chat the router knows. */
export function isLarkChat(name: string): name is LarkChat {
  return name in LARK_CHATS;
}
