import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { log, reportError } from "@/kernel/config/log";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/entities/billing/stripe";
import { handleFailed, handlePaid, type FulfilmentResult } from "./fulfilment";

// Stripe webhook — the payment truth this repo has been missing: until now
// orders were written as 'pending' at session-create time and never
// confirmed. Handles two shapes:
//
//  1. Event registrations (session.metadata.type === 'event_registration',
//     created by /events/[slug]): completed → order 'paid' + registration
//     pending_payment → registered + ticket email; expired/failed → seat
//     released (registration cancelled, order expired).
//  2. Everything else with a session id we stamped (saigon-private private
//     sessions, legacy flows): the order found by stripe_session_id is
//     flipped pending → paid/expired. No registration side effects.
//
// Idempotent by construction: every write is guarded by the row's current
// status (or by a lookup of what a previous delivery wrote), so Stripe
// redeliveries and out-of-order events are no-ops. The fulfilment steps live
// in ./fulfilment.ts — a route module may only export HTTP methods, and the
// steps are what the tests exercise (./fulfilment.test.ts).
//
// Operator setup: add a webhook endpoint in the Stripe dashboard pointing at
// /api/stripe/webhook with checkout.session.completed,
// checkout.session.expired, checkout.session.async_payment_succeeded and
// checkout.session.async_payment_failed, then set STRIPE_WEBHOOK_SECRET
// (prod) / STRIPE_WEBHOOK_TEST_SECRET (dev) from the endpoint's signing
// secret.

export async function POST(request: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    log("error", "stripe webhook secret not set; event dropped", { route: "stripe/webhook" });
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    reportError(err, { route: "stripe/webhook", step: "signature-verification" });
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let result: FulfilmentResult = { kind: "ok" };
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      // completed with payment still processing (async methods) → wait for
      // async_payment_succeeded instead of marking paid early.
      if (event.type === "checkout.session.completed" && session.payment_status === "unpaid") break;
      result = await handlePaid(session);
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      result = await handleFailed(event.data.object as Stripe.Checkout.Session);
      break;
    }
    default:
      break; // subscribed events only; anything else is a config drift no-op
  }

  // A transient infrastructure failure (a Supabase error on a write the
  // fulfilment depends on) must NOT be acknowledged: the customer has paid
  // and the row is still pending, so 5xx and let Stripe redeliver. The old
  // worry — a permanently failing row retried forever — is already bounded by
  // Stripe's own retry schedule (~3 days of backoff, then the event is
  // abandoned and surfaced in the dashboard). Business no-ops (already paid,
  // unknown session, nothing to fulfil) still return 200.
  if (result.kind === "retry") {
    return NextResponse.json({ error: `Fulfilment failed: ${result.reason}. Please retry.` }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
