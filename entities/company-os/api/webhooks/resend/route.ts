import { NextResponse } from "next/server";
import { companyOs, type Json } from "@/kernel/data/supabase";
import { selectEmailMessages, selectEmailCampaignRecipients, insertEmailEvents } from "@/entities/campaigns";
import { readSvixHeaders, verifySvixSignature } from "@/entities/billing";

// Resend delivery webhooks -> company_os.email_events.
//
// Register this in the Resend dashboard as:
//   https://<your-domain>/api/webhooks/resend/
// The TRAILING SLASH is required. next.config sets trailingSlash: true, so the
// slashless URL answers 308 and Resend does not follow redirects — every event
// would be silently dropped, the same failure mode that killed the crons.

const LOG = "[webhooks/resend]";

// Resend event names -> our event_type check-constraint values.
export const EVENT_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
};

type ResendWebhook = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string | string[];
    subject?: string;
    created_at?: string;
    [key: string]: unknown;
  };
};

export function firstRecipient(to: string | string[] | undefined): string | null {
  if (!to) return null;
  const value = Array.isArray(to) ? to[0] : to;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail loudly rather than accepting unverified payloads. A half-configured
    // deploy should look broken, not look like nobody is emailing us.
    console.error(`${LOG} RESEND_WEBHOOK_SECRET not set — event rejected.`);
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  // Signature is over the raw bytes, so read text before any JSON parsing.
  const rawBody = await request.text();
  const svixHeaders = readSvixHeaders(request.headers);
  const verdict = verifySvixSignature({
    rawBody,
    headers: svixHeaders,
    secret,
  });
  if (!verdict.ok) {
    console.error(`${LOG} signature verification failed: ${verdict.reason}`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: ResendWebhook;
  try {
    payload = JSON.parse(rawBody) as ResendWebhook;
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  const eventType = payload.type ? EVENT_MAP[payload.type] : undefined;
  if (!eventType) {
    // Unknown event type: verified but not something we model. Acknowledge so
    // Resend stops retrying, and say so in the response for debugging.
    return NextResponse.json({ received: true, ignored: payload.type ?? null });
  }

  const emailId = payload.data?.email_id;
  const recipient = firstRecipient(payload.data?.to);
  if (!emailId || !recipient) {
    console.error(`${LOG} ${payload.type} missing email_id or recipient — dropped.`);
    return NextResponse.json({ received: true, ignored: "incomplete payload" });
  }

  const occurredAt = payload.created_at ?? payload.data?.created_at ?? new Date().toISOString();

  // Best-effort match to a CRM contact. people.email is citext, so the
  // lowercased recipient matches regardless of how it was stored. A duplicate
  // address makes maybeSingle() error rather than return a row, so log it
  // instead of silently filing the event against nobody.
  const { data: person, error: personError } = await companyOs
    .from("people")
    .select("id")
    .eq("email", recipient)
    .is("archived_at", null)
    .maybeSingle();

  if (personError) {
    console.error(`${LOG} person lookup for ${recipient} failed: ${personError.message}`);
  }

  // Attribute the event to a campaign when the Resend id matches a recipient
  // row. The send cron backfills any event that arrives before the sender has
  // stamped that id, so this is an optimisation rather than the only path.
  const { data: recipient_row, error: recipientError } = await selectEmailCampaignRecipients("campaign_id")
    .eq("resend_email_id", emailId)
    .maybeSingle();

  if (recipientError) {
    console.error(
      `${LOG} campaign recipient lookup for ${emailId} failed: ${recipientError.message}`,
    );
  }

  // A personal message carries its own Resend id; an event on one lands with
  // message_id, beside campaign_id for a broadcast.
  const { data: message_row, error: messageError } = await selectEmailMessages("id")
    .eq("resend_email_id", emailId)
    .maybeSingle();
  if (messageError) console.error(`${LOG} message lookup for ${emailId} failed: ${messageError.message}`);

  const { error } = await insertEmailEvents({
    resend_email_id: emailId,
    // The Svix message id is stable across retries of the same event, so it is
    // the real idempotency key. The composite (email, type, occurred_at) index
    // cannot cover a payload that carries no timestamp: occurred_at then falls
    // back to now(), which differs on every retry and would double-count.
    svix_id: svixHeaders.id,
    event_type: eventType,
    recipient,
    person_id: person?.id ?? null,
    campaign_id: (recipient_row as { campaign_id: string } | null)?.campaign_id ?? null,
    message_id: (message_row as { id: string } | null)?.id ?? null,
    subject: payload.data?.subject ?? null,
    occurred_at: occurredAt,
    // jsonb column; the webhook payload is validated as an open record, so
    // the jsonb value type is asserted at the write.
    metadata: { resend_type: payload.type, data: payload.data ?? {} } as Json,
  });

  if (error) {
    // 23505 is the dedupe index doing its job on a Resend retry, not a failure.
    if (error.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error(`${LOG} insert failed:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ received: true, event: eventType });
}
