import type Stripe from "stripe";
import { companyOs } from "@/kernel/data/supabase";
import { selectAffiliates } from "@/entities/contacts";
import { sendEventTicketEmail, sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { formatEventDates, ticketPath, newTicketCode, insertEventRegistrations, updateEventRegistrations } from "@/entities/retreats";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { selectCompanies } from "@/kernel/identity/reads";
import { selectInquiries, updateInquiries } from "@/entities/crm";
import { EMAIL_SIGN_OFF, OPS_EMAIL } from "@/kernel/config/contacts";
import { GREETING_COLUMNS, greetingName, personName } from "@/kernel/config/people-name";
import { escapeHtml } from "@/kernel/config/html";

// Fulfilment for the Stripe webhook, kept out of route.ts because a Next.js
// route module may only export HTTP methods and route config — and because
// these steps are the part worth testing directly (see fulfilment.test.ts).
//
// Every step returns a discriminated result instead of throwing:
//
//   { kind: "ok" }                   — done, or a business no-op (already
//                                      paid, unknown session, nothing to do).
//   { kind: "retry"; reason }        — a transient infrastructure failure (a
//                                      Supabase `error` on a write fulfilment
//                                      depends on). The route turns this into
//                                      a 5xx so Stripe redelivers.
//
// Redelivery safety is what makes the retry path sound: every write is
// guarded by the row's current status or by a lookup of what a previous
// delivery already wrote, so a redelivery repeats no side effect.
export type FulfilmentResult = { kind: "ok" } | { kind: "retry"; reason: string };

const ok: FulfilmentResult = { kind: "ok" };
function retry(step: string, message: string): FulfilmentResult {
  console.error(`[stripe/webhook] ${step} failed (asking Stripe to retry):`, message);
  return { kind: "retry", reason: step };
}

export async function handlePaid(session: Stripe.Checkout.Session): Promise<FulfilmentResult> {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Order first (both shapes): pending → paid, guarded by current status.
  // 'expired' is also flippable: infinite-leverage's payment-recovery flow
  // (/pay/[orderId]) re-mints a checkout session after the original expired,
  // so a payment can legitimately arrive on an order this webhook already
  // expired. Payment truth wins.
  const { data: order, error: orderErr } = await companyOs
    .from("orders")
    // No metadata write — a jsonb update would clobber what the checkout
    // flow stored there (booking details). paid-at = updated_at on this row.
    .update({ status: "paid", stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_session_id", session.id)
    .in("status", ["pending", "expired"])
    .select("id")
    .maybeSingle();
  // A failed order flip is the one thing that must never be acknowledged: the
  // customer has paid and the row still says pending. Stop before any
  // downstream fulfilment and let Stripe redeliver.
  if (orderErr) return retry("order update", orderErr.message);
  if (!order) {
    // Already paid (redelivery) or an order we never recorded — a business
    // no-op. Downstream steps are guarded too, so continuing is safe.
    console.warn("[stripe/webhook] no pending order for session", session.id);
  }

  if (session.metadata?.type === "token_pack") {
    return handleTokenPackPaid(session);
  }

  // Infinite-leverage retreat checkout (reserve funnel on infiniteleverage-8.com).
  // Fulfilment ported from the old aio-website webhook: registration rows for
  // seat counts, inquiry → won, affiliate commission, buyer confirmation email.
  if (session.metadata?.source_site === "infiniteleverage-8.com") {
    return handleInfiniteLeveragePaid(session);
  }

  if (session.metadata?.type !== "event_registration") return ok;
  const registrationId = session.metadata.registration_id;
  if (!registrationId) return ok;

  const { data: reg, error: regErr } = await updateEventRegistrations({ status: "registered" })
    .eq("id", registrationId)
    .eq("status", "pending_payment")
    .select(`id, ticket_code, attendee_email, confirmation_sent_at, people(${GREETING_COLUMNS}), events(title, location, starts_at, ends_at, timezone)`)
    .maybeSingle();
  if (regErr) return retry("registration update", regErr.message);
  if (!reg) return ok; // redelivery — already flipped

  const eventRow = Array.isArray(reg.events) ? reg.events[0] ?? null : reg.events;
  if (!eventRow || !reg.ticket_code || !reg.attendee_email || reg.confirmation_sent_at) return ok;

  const sent = await sendEventTicketEmail({
    to: reg.attendee_email,
    name: greetingName(Array.isArray(reg.people) ? reg.people[0] : reg.people, null),
    eventTitle: eventRow.title,
    dateLabel: formatEventDates(eventRow.starts_at, eventRow.ends_at, eventRow.timezone),
    location: eventRow.location,
    ticketUrl: `${await getSiteOrigin()}${ticketPath(reg.ticket_code)}`,
  });
  if (sent) {
    // Best-effort stamp: the email is already out, so a failure here must not
    // make Stripe redeliver — that would send a second ticket email.
    const { error: stampErr } = await updateEventRegistrations({ confirmation_sent_at: new Date().toISOString() })
      .eq("id", reg.id);
    if (stampErr) console.error("[stripe/webhook] confirmation stamp failed:", stampErr.message);
  }
  return ok;
}

// Attendee rows for team-member add-on seats, from the reserve funnel's
// session metadata. Prefers the "Name <email>; Name" summary in
// metadata.team_members; falls back to a bare count from metadata.add_ons
// ("id:qty,team_member:N"). Ported from the old aio-website webhook.
type AttendeeRow = { name: string | null; email: string | null };

export function resolveTeamMemberAttendees(
  metadata: Stripe.Metadata | null | undefined,
): AttendeeRow[] {
  const raw = metadata?.team_members?.trim();
  if (raw) {
    return raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const match = entry.match(/^(.*?)\s*<([^>]+)>\s*$/);
        if (match) {
          return { name: match[1].trim() || null, email: match[2].trim() || null };
        }
        return { name: entry || null, email: null };
      });
  }
  const addOns = metadata?.add_ons ?? "";
  const teamEntry = addOns
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.startsWith("team_member:"));
  const count = teamEntry ? parseInt(teamEntry.split(":")[1] ?? "0", 10) || 0 : 0;
  return Array.from({ length: count }, () => ({ name: null, email: null }));
}

// Infinite-leverage retreat paid. Each step carries its own redelivery guard,
// which is what lets any step ask for a retry:
//
//  1. registrations — inserted only when the order_id count is 0;
//  2. buyer email + ops ping — tied to that same first insert, and sent
//     immediately after it so a retry of a later step cannot lose them;
//  3. inquiry → won — skipped when it is already won, so it never regresses
//     and a redelivery writes nothing;
//  4. commission — inserted only when no (order_id, source_event) row exists.
async function handleInfiniteLeveragePaid(session: Stripe.Checkout.Session): Promise<FulfilmentResult> {
  const { data: order, error: orderErr } = await companyOs
    .from("orders")
    .select(
      `id, person_id, product_id, amount_cents, amount_usd_cents, currency, affiliate_id, products(id, title, slug, cohort_slug, tier, location, date_start, date_end, event_id), people(${GREETING_COLUMNS})`,
    )
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (orderErr) return retry("IL order lookup", orderErr.message);
  if (!order) {
    // An order we never recorded — nothing to fulfil, and no retry will
    // conjure the row.
    console.warn("[stripe/webhook] no IL order for session", session.id);
    return ok;
  }
  const product = Array.isArray(order.products) ? order.products[0] ?? null : order.products;
  const person = Array.isArray(order.people) ? order.people[0] ?? null : order.people;
  if (!product || !person) {
    // A data-integrity problem, not a transient one: retrying cannot fix a
    // missing join.
    console.error("[stripe/webhook] IL order missing product/person joins:", order.id);
    return ok;
  }

  // 1. Registration rows — one per seat so capacity counts every attendee:
  // the buyer plus any team-member add-on seats. The reserve flow sends
  // attendee details in metadata.team_members ("Name <email>; Name"), seat
  // count mirrored in metadata.add_ons ("team_member:N"). Team rows reuse the
  // buyer's person_id (NOT NULL, booked under the buyer); attendee_name/email
  // distinguish them.
  const { count, error: countErr } = await companyOs
    .from("event_registrations")
    .select("*", { count: "exact", head: true })
    .eq("order_id", order.id);
  // Without a trustworthy count the insert guard is blind — inserting anyway
  // is how a redelivery duplicates seats.
  if (countErr) return retry("IL registration count", countErr.message);
  const firstFulfilment = (count ?? 0) === 0;

  if (firstFulfilment) {
    const teamRows = resolveTeamMemberAttendees(session.metadata).map((m) => ({
      order_id: order.id,
      product_id: product.id,
      event_id: product.event_id,
      person_id: order.person_id,
      attendee_name: m.name,
      attendee_email: m.email,
      status: "confirmed" as const,
      guest_count: 0,
      ticket_code: newTicketCode(),
    }));
    const { error: regError } = await insertEventRegistrations([
      {
        order_id: order.id,
        product_id: product.id,
        event_id: product.event_id,
        person_id: order.person_id,
        attendee_name: person.full_name,
        attendee_email: person.email,
        status: "confirmed" as const,
        guest_count: 0,
        ticket_code: newTicketCode(),
      },
      ...teamRows,
    ]);
    if (regError) return retry("IL registration insert", regError.message);

    // 2. Buyer confirmation + ops ping, first fulfilment only. Deliberately
    // right after the insert that gates it: a retry asked for by step 3 or 4
    // re-enters this function with count > 0, so the email is sent exactly
    // once whether or not the later steps succeed.
    const amountLabel = `${order.currency.toUpperCase()} $${(order.amount_cents / 100).toLocaleString()}`;
    // Day-granular label; AUD cohorts run in Australia, everything else in Vietnam.
    const tz = order.currency === "aud" ? "Australia/Sydney" : "Asia/Ho_Chi_Minh";
    const dateLabel = product.date_start
      ? formatEventDates(product.date_start, product.date_end, tz)
      : null;
    if (person.email) {
      await sendTransactionalEmail({
        to: person.email,
        subject: `You're in: ${product.title}`,
        html: `
          <p>Hi ${escapeHtml(greetingName(person, "there"))},</p>
          <p>Your payment of <strong>${amountLabel}</strong> for <strong>${product.title}</strong> is confirmed — your seat is locked in.</p>
          ${dateLabel ? `<p><strong>Dates:</strong> ${dateLabel}${product.location ? ` · ${product.location}` : ""}</p>` : ""}
          <p>We'll follow up before the event with everything you need to prepare. Reply to this email any time with questions.</p>
          ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
        `.trim(),
        replyTo: OPS_EMAIL,
        logMeta: { source: "il_retreat_paid" },
      });
    }
    await notifyOps(
      `🌴 Retreat paid: ${personName(person, "someone")} — ${product.title}, ${amountLabel}.`,
    );
  }

  // 3. Latest retreat inquiry for this person → won, payment details merged
  // into metadata. Never regresses an inquiry that is already won — and an
  // inquiry already won means a previous delivery did this step, so a
  // redelivery performs no write at all.
  const { data: inquiry, error: inqLookupErr } = await selectInquiries("id, status, metadata")
    .eq("person_id", order.person_id)
    .eq("type", "retreat")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inqLookupErr) return retry("IL inquiry lookup", inqLookupErr.message);
  // crm owns inquiries, so the door read erases the row shape; state it here.
  const inq = inquiry as { id: string; status: string | null; metadata: unknown } | null;
  if (inq && inq.status !== "won") {
    const mergedMeta = {
      ...((inq.metadata as Record<string, unknown>) ?? {}),
      payment_method: "stripe",
      payment_amount_cents: order.amount_cents,
      payment_currency: order.currency,
      order_id: order.id,
      product_slug: product.slug,
      ...(product.cohort_slug ? { cohort: product.cohort_slug } : {}),
      ...(product.tier ? { tier: product.tier } : {}),
    };
    const { error: inqError } = await updateInquiries({ status: "won", metadata: mergedMeta })
      .eq("id", inq.id)
      .neq("status", "won");
    if (inqError) return retry("IL inquiry advance", inqError.message);
  } else if (!inq) {
    console.warn("[stripe/webhook] no retreat inquiry found for IL person", order.person_id);
  }

  // 4. Commission ledger — only when the customer used a commission-type code
  // (discount conversions earn nothing; the discount was the compensation).
  // gross is USD-settled when the order carries amount_usd_cents (AUD orders).
  const codeType = session.metadata?.affiliate_code_type;
  if (order.affiliate_id && codeType === "commission") {
    const { data: existingCommission, error: commLookupErr } = await companyOs
      .from("affiliate_commissions")
      .select("id")
      .eq("order_id", order.id)
      .eq("source_event", "order_paid")
      .limit(1)
      .maybeSingle();
    // Same reasoning as the registration count: an unreadable guard must not
    // be treated as "no row exists".
    if (commLookupErr) return retry("IL commission lookup", commLookupErr.message);
    if (!existingCommission) {
      const { data: affRow, error: affErr } = await selectAffiliates("id, rate")
        .eq("id", order.affiliate_id)
        .maybeSingle();
      if (affErr) return retry("IL affiliate lookup", affErr.message);
      const aff = affRow as { id: string; rate: number } | null; // contacts' table, shape stated here
      if (aff) {
        const grossCents = order.amount_usd_cents ?? order.amount_cents;
        const { error: commError } = await companyOs.from("affiliate_commissions").insert({
          affiliate_id: aff.id,
          order_id: order.id,
          source_event: "order_paid",
          source_ref: session.id,
          gross_cents: grossCents,
          rate: aff.rate,
          commission_cents: Math.round(grossCents * aff.rate),
          notes: `${product.title} (${order.currency.toUpperCase()} order, gross in USD).`,
        });
        if (commError) return retry("IL commission insert", commError.message);
      }
    }
  }

  return ok;
}

// Human-token pack paid: flip the purchase (guarded pending → paid, so
// redeliveries no-op), then receipts — client email, accountant email, ops
// Lark — only on the first flip.
async function handleTokenPackPaid(session: Stripe.Checkout.Session): Promise<FulfilmentResult> {
  const purchaseId = session.metadata?.token_purchase_id;
  if (!purchaseId) return ok;

  const { data: purchase, error } = await companyOs
    .from("token_purchases")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "pending")
    .select("id, packs, tokens, amount_cents, company_id, person_id")
    .maybeSingle();
  if (error) return retry("token purchase update", error.message);
  if (!purchase) return ok; // redelivery — already flipped

  // Receipt lookups only: a failure here would cost a second receipt email on
  // redelivery (the flip above has already happened), so they are logged, not
  // retried.
  const [{ data: person, error: personErr }, { data: company, error: companyErr }] = await Promise.all([
    companyOs.from("people").select(GREETING_COLUMNS).eq("id", purchase.person_id).maybeSingle(),
    selectCompanies("name").eq("id", purchase.company_id).maybeSingle(),
  ]);
  if (personErr) console.error("[stripe/webhook] token purchase person lookup failed:", personErr.message);
  if (companyErr) console.error("[stripe/webhook] token purchase company lookup failed:", companyErr.message);

  const amountLabel = `$${(purchase.amount_cents / 100).toLocaleString()}`;
  const toEmail = session.customer_email || person?.email;
  if (toEmail) {
    await sendTransactionalEmail({
      to: toEmail,
      subject: `Your Edge8 human tokens: ${purchase.tokens} hours`,
      html: `
        <p>Hi ${escapeHtml(greetingName(person, "there"))},</p>
        <p>Thanks — your payment of <strong>${amountLabel}</strong> for ${purchase.packs} ${
          purchase.packs === 1 ? "pack" : "packs"
        } (<strong>${purchase.tokens} human tokens</strong>, 1 token = 1 hour of skilled work) is confirmed.</p>
        <p>Your balance is live in your portal: ${await getSiteOrigin()}/portal/tokens</p>
        <p style="margin-top:24px;">Reply to this email any time to put them to work.</p>
        ${EMAIL_SIGN_OFF ? `<p>${EMAIL_SIGN_OFF}</p>` : ""}
      `.trim(),
      replyTo: OPS_EMAIL,
    });
  }
  if (process.env.ACCOUNTING_EMAIL) {
    await sendTransactionalEmail({
      to: process.env.ACCOUNTING_EMAIL,
      subject: `Token pack purchase: ${company?.name ?? "client"} — ${amountLabel}`,
      html: `<p>${company?.name ?? "A client"} bought ${purchase.packs} human-token ${
        purchase.packs === 1 ? "pack" : "packs"
      } (${purchase.tokens} tokens) for ${amountLabel} via Stripe. Paid by ${toEmail ?? "unknown"}.</p>`,
      replyTo: OPS_EMAIL,
    });
  }
  await notifyOps(
    `🪙 Token packs purchased: ${company?.name ?? "client"} — ${purchase.packs} ${
      purchase.packs === 1 ? "pack" : "packs"
    } / ${purchase.tokens} tokens, ${amountLabel}.`,
  );
  return ok;
}

export async function handleFailed(session: Stripe.Checkout.Session): Promise<FulfilmentResult> {
  const { error: orderErr } = await companyOs
    .from("orders")
    .update({ status: "expired" })
    .eq("stripe_session_id", session.id)
    .eq("status", "pending");
  if (orderErr) return retry("order expire", orderErr.message);

  if (session.metadata?.type === "token_pack") {
    const purchaseId = session.metadata.token_purchase_id;
    if (purchaseId) {
      const { error } = await companyOs
        .from("token_purchases")
        .update({ status: "expired" })
        .eq("id", purchaseId)
        .eq("status", "pending");
      if (error) return retry("token purchase expire", error.message);
    }
    return ok;
  }

  if (session.metadata?.type !== "event_registration") return ok;
  const registrationId = session.metadata.registration_id;
  if (!registrationId) return ok;

  // Release the held seat: cancelled rows don't count against capacity in
  // the register_for_event RPC, so the seat frees up immediately.
  const { error: regErr } = await updateEventRegistrations({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", registrationId)
    .eq("status", "pending_payment");
  if (regErr) return retry("registration release", regErr.message);
  return ok;
}
