"use server";

import { companyOs } from "@/kernel/data/supabase";
import { selectProducts } from "@/entities/finance";
import { getOrCreatePerson } from "@/kernel/data/company-os";
import { promotePersonToLead } from "@/entities/crm";
import { registerForEvent } from "@/entities/retreats/events-server";
import { sendEventTicketEmail } from "@/kernel/messaging/email";
import { GREETING_COLUMNS, type GreetedPerson, greetingName } from "@/kernel/config/people-name";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { stripe } from "@/entities/billing";
import { formatEventDates, ticketPath, eventPath } from "@/entities/retreats/events";
import { insertOrders, updateOrders } from "@/entities/billing";
import { SOURCE_SITE } from "@/kernel/config/utils";

// Public registration for /events/[slug]. Free tiers confirm immediately;
// paid tiers hold the seat atomically (pending_payment) and hand off to
// Stripe Checkout — the webhook at /api/stripe/webhook flips the seat to
// registered on payment, or releases it if the session expires.

export type PublicRegisterInput = {
  name: string;
  email: string;
  phone?: string;
  productId?: string | null;
  guestCount?: number;
};

export type PublicRegisterResult =
  | {
      ok: true;
      status: "registered" | "waitlisted";
      alreadyRegistered: boolean;
      ticketPath: string | null;
      waitlistPosition: number | null;
    }
  | { ok: true; status: "payment"; checkoutUrl: string }
  | { ok: false; error: string };

const MAX_GUESTS = 4;
const CHECKOUT_EXPIRY_MINUTES = 30; // Stripe's minimum for expires_at

// The RPC raises these as exception messages; map to human copy.
const RPC_ERRORS: Record<string, string> = {
  event_not_found: "This event no longer exists.",
  event_not_open: "Registration isn't open for this event.",
  product_not_for_event: "That ticket doesn't belong to this event.",
  tier_full: "That ticket type is sold out. Pick another, or try again later.",
};

type TierRow = {
  id: string;
  title: string;
  amount_cents: number;
  currency: string;
  active: boolean;
};

export async function registerForEventPublic(
  slug: string,
  input: PublicRegisterInput
): Promise<PublicRegisterResult> {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!name) return { ok: false, error: "Your name is required." };
  if (!email || !email.includes("@")) return { ok: false, error: "A valid email is required." };

  const { data: event, error: evErr } = await companyOs
    .from("events")
    .select("id, slug, title, status, location, starts_at, ends_at, timezone, landing_path")
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (evErr) return { ok: false, error: "Something went wrong. Please try again." };
  if (!event) return { ok: false, error: "This event no longer exists." };
  if (event.status !== "open") return { ok: false, error: "Registration isn't open for this event." };

  let tier: TierRow | null = null;
  if (input.productId) {
    const { data, error: tErr } = await selectProducts("id, title, amount_cents, currency, active")
      .eq("id", input.productId)
      .eq("event_id", event.id)
      .maybeSingle();
    if (tErr) return { ok: false, error: "Something went wrong. Please try again." };
    tier = data as TierRow | null;
    if (!tier || !tier.active) return { ok: false, error: "That ticket is no longer available." };
  }

  const isPaid = !!tier && tier.amount_cents > 0;
  // Guests ride along free on a free ticket; a paid seat is exactly one seat
  // (per-guest pricing doesn't exist), so paid registrations carry no guests.
  const guestCount = isPaid ? 0 : Math.min(MAX_GUESTS, Math.max(0, Math.trunc(input.guestCount ?? 0)));

  const person = await getOrCreatePerson({ email, name, phone: input.phone || null, source: "event_signup" });
  if (!person.ok) return { ok: false, error: person.error };

  let result;
  try {
    result = await registerForEvent({
      eventId: event.id,
      personId: person.id,
      productId: input.productId ?? null,
      attendeeName: name,
      attendeeEmail: email,
      guestCount,
      holdForPayment: isPaid,
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "";
    return { ok: false, error: RPC_ERRORS[raw] ?? "Something went wrong. Please try again." };
  }

  // CRM: event registrants enter the lead queue (no inquiry row — inquiries
  // are contact-us only per the 2026-07-06 CRM cleanup; the registration row
  // itself is the activity record). Best-effort, never blocks the signup.
  try {
    await promotePersonToLead(person.id, { reason: "event_registration" });
  } catch (err) {
    console.error("event signup lead promotion failed:", err);
  }

  // Seat held for payment — fresh hold or an idempotent repeat whose earlier
  // checkout was abandoned (its 30-min session lapsed or was closed). Either
  // way, send them to a fresh Checkout session for the SAME registration row;
  // the webhook resolves whichever session completes, and duplicates are
  // impossible because completion is guarded by status='pending_payment'.
  if (result.status === "pending_payment") {
    if (!tier || !isPaid) {
      // An existing paid hold hit via the free path (e.g. they re-registered
      // without picking the paid tier). Point them back through checkout.
      return {
        ok: false,
        error: "You already have a registration awaiting payment for this event. Pick the same ticket again to get a new payment link.",
      };
    }
    return createCheckoutForHold({
      event,
      tier,
      registrationId: result.registration_id,
      ticketCode: result.ticket_code,
      email,
      personId: person.id,
    });
  }

  const status = result.status === "waitlisted" ? "waitlisted" : "registered";

  // Confirmation email, idempotent via confirmation_sent_at — covers both a
  // fresh registration and an already_registered repeat whose original send
  // failed or was skipped (no RESEND_API_KEY in preview).
  if (status === "registered" && result.ticket_code) {
    const { data: reg, error: regError } = await companyOs
      .from("event_registrations")
      .select(`confirmation_sent_at, people(${GREETING_COLUMNS})`)
      .eq("id", result.registration_id)
      .maybeSingle();
    if (regError) console.error("[retreats] event_registrations read failed:", regError.message);
    if (reg && !reg.confirmation_sent_at) {
      // Greeted by the person's given name, never the typed name's first word.
      const people = reg.people as GreetedPerson | GreetedPerson[] | null;
      const sent = await sendEventTicketEmail({
        to: email,
        name: greetingName(Array.isArray(people) ? people[0] : people, null),
        eventTitle: event.title,
        dateLabel: formatEventDates(event.starts_at, event.ends_at, event.timezone),
        location: event.location,
        ticketUrl: `${await getSiteOrigin()}${ticketPath(result.ticket_code)}`,
      });
      if (sent) {
        await companyOs
          .from("event_registrations")
          .update({ confirmation_sent_at: new Date().toISOString() })
          .eq("id", result.registration_id);
      }
    }
  }

  return {
    ok: true,
    status,
    alreadyRegistered: result.already_registered,
    ticketPath: result.ticket_code ? ticketPath(result.ticket_code) : null,
    waitlistPosition: result.waitlist_position,
  };
}

async function createCheckoutForHold(args: {
  event: { id: string; slug: string; title: string };
  tier: TierRow;
  registrationId: string;
  ticketCode: string | null;
  email: string;
  personId: string;
}): Promise<PublicRegisterResult> {
  const { event, tier, registrationId, ticketCode, email, personId } = args;
  const origin = await getSiteOrigin();

  // One order per checkout attempt, linked to the held registration. An
  // abandoned attempt's order expires via the webhook; the registration
  // keeps pointing at the latest attempt.
  const { data: order, error: orderErr } = await insertOrders({
      person_id: personId,
      product_id: tier.id,
      payment_method: "stripe",
      amount_cents: tier.amount_cents,
      currency: tier.currency,
      status: "pending",
      seat_hold_expires_at: new Date(Date.now() + CHECKOUT_EXPIRY_MINUTES * 60_000).toISOString(),
      metadata: { type: "event_registration", event_id: event.id, registration_id: registrationId },
    })
    .select("id")
    .single();
  if (orderErr || !order) {
    console.error("[events] order insert failed:", orderErr?.message);
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }

  let checkoutUrl: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // price_data (not the product's stripe_price_id): tier prices in
      // company_os are the source of truth, and mirrored catalog rows may
      // carry price ids from another Stripe account (caio-coach).
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: tier.currency,
            unit_amount: tier.amount_cents,
            product_data: { name: `${event.title} — ${tier.title}` },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_MINUTES * 60,
      customer_email: email,
      billing_address_collection: "required",
      allow_promotion_codes: true,
      // The ticket page already renders the pending → registered transition
      // honestly, so it doubles as the success page (no race with the
      // webhook: worst case it says "payment pending" for a few seconds).
      success_url: ticketCode ? `${origin}${ticketPath(ticketCode)}` : `${origin}${eventPath(event.slug)}`,
      cancel_url: `${origin}${eventPath(event.slug)}`,
      metadata: {
        type: "event_registration",
        event_id: event.id,
        event_slug: event.slug,
        registration_id: registrationId,
        order_id: order.id,
        person_id: personId,
        source_site: SOURCE_SITE,
      },
    });
    checkoutUrl = session.url;

    await updateOrders({ stripe_session_id: session.id }).eq("id", order.id);
    await companyOs.from("event_registrations").update({ order_id: order.id }).eq("id", registrationId);
  } catch (err) {
    console.error("[events] stripe session create failed:", err instanceof Error ? err.message : err);
    // Release the hold so an unpayable seat doesn't block capacity.
    await companyOs
      .from("event_registrations")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", registrationId)
      .eq("status", "pending_payment");
    await updateOrders({ status: "expired" }).eq("id", order.id).eq("status", "pending");
    return { ok: false, error: "Couldn't start checkout. Please try again." };
  }

  if (!checkoutUrl) return { ok: false, error: "Couldn't start checkout. Please try again." };
  return { ok: true, status: "payment", checkoutUrl };
}
