"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { getOrCreatePerson } from "@/kernel/data/company-os";
import { newTicketCode } from "@/entities/retreats";
import { SEAT_HOLDING_STATUSES } from "@/entities/retreats";
import { convertToUsdCents } from "@/kernel/data/fx";
import { insertEventRegistrations, updateEventRegistrations } from "@/entities/retreats";
import { deleteOrders, insertOrders, updateOrders } from "@/entities/billing";

type Result = { ok: true; warning?: string } | { ok: false; error: string };

function refresh(eventId: string) {
  revalidateSurfaces(`/revenue/events/${eventId}`);
}

// ─── Manual add ──────────────────────────────────────────────────────────────
// Distinct from the public register_for_event RPC (PR 1): that RPC only
// accepts events with status='open' and auto-waitlists when full, because
// it's built for real public signups. Admin manual-add needs to work on any
// event status (backfilling a past attendee, logging a walk-in after the
// event closed) and always registers directly — an admin adding someone on
// purpose doesn't want them silently waitlisted. If it would exceed
// capacity, the row still gets added but the result carries a warning so the
// admin can raise capacity or accept the overage knowingly.

export type ManualAddInput = {
  email: string;
  name?: string | null;
  phone?: string | null;
  productId?: string | null;
  guestCount?: number;
};

export async function addManualRegistration(eventId: string, input: ManualAddInput): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const person = await getOrCreatePerson({ email: input.email, name: input.name, phone: input.phone, source: "admin_manual_add" });
  if (!person.ok) return { ok: false, error: person.error };

  const guestCount = Math.max(0, Math.trunc(input.guestCount ?? 0));

  const { data: event, error: evErr } = await companyOs.from("events").select("capacity").eq("id", eventId).maybeSingle();
  if (evErr) return { ok: false, error: evErr.message };
  if (!event) return { ok: false, error: "Event not found." };

  let warning: string | undefined;
  if (event.capacity !== null) {
    const { count, error: cErr } = await companyOs
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", SEAT_HOLDING_STATUSES);
    if (cErr) return { ok: false, error: cErr.message };
    if ((count ?? 0) + 1 + guestCount > event.capacity) {
      warning = `This exceeds the event's capacity of ${event.capacity} — added anyway since this was a manual add.`;
    }
  }

  const { data: reg, error } = await insertEventRegistrations({
      event_id: eventId,
      product_id: input.productId ?? null,
      person_id: person.id,
      attendee_name: input.name?.trim() || null,
      attendee_email: input.email.trim().toLowerCase(),
      status: "registered",
      guest_count: guestCount,
      ticket_code: newTicketCode(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "event_registrations",
    recordId: reg.id,
    operation: "insert",
    actor: admin.email,
    newData: { event_id: eventId, person_id: person.id, guest_count: guestCount },
    context: { via: "event_roster_manual_add" },
  });
  refresh(eventId);
  return { ok: true, warning };
}

// ─── Check-in ────────────────────────────────────────────────────────────────

export async function setCheckedIn(eventId: string, registrationId: string, checkedIn: boolean): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const { data: reg, error: fErr } = await companyOs
    .from("event_registrations")
    .select("status")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (fErr) return { ok: false, error: fErr.message };
  if (!reg) return { ok: false, error: "Registration not found." };
  const checkInEligible: readonly string[] = SEAT_HOLDING_STATUSES;
  if (!checkInEligible.includes(reg.status) && reg.status !== "attended") {
    return { ok: false, error: `Can't check in a ${reg.status} registration.` };
  }

  const updates = checkedIn
    ? { status: "attended", checked_in_at: new Date().toISOString() }
    : { status: "registered", checked_in_at: null };

  const { error } = await updateEventRegistrations(updates).eq("id", registrationId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "event_registrations",
    recordId: registrationId,
    operation: "update",
    actor: admin.email,
    newData: updates,
    context: { via: "event_roster_checkin" },
  });
  refresh(eventId);
  return { ok: true };
}

// ─── Bulk no-show ────────────────────────────────────────────────────────────
// Only touches rows still sitting in registered/confirmed — never overwrites
// attended, cancelled, waitlisted, pending_payment, or already-no_show rows.

export async function markRemainingNoShow(eventId: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const { data, error } = await updateEventRegistrations({ status: "no_show" })
    .eq("event_id", eventId)
    .in("status", ["registered", "confirmed"])
    .select("id");
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "event_registrations",
    operation: "bulk_update",
    actor: admin.email,
    newData: { status: "no_show" },
    context: { event_id: eventId, registration_ids: (data ?? []).map((r) => r.id), via: "event_roster_bulk_no_show" },
  });
  refresh(eventId);
  return { ok: true };
}

// ─── Waitlist promote ────────────────────────────────────────────────────────
// Manual only — auto-promotion is out of scope for v1 (design doc §7).

export async function promoteFromWaitlist(eventId: string, registrationId: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const { data: reg, error: fErr } = await companyOs
    .from("event_registrations")
    .select("status")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (fErr) return { ok: false, error: fErr.message };
  if (!reg) return { ok: false, error: "Registration not found." };
  if (reg.status !== "waitlisted") return { ok: false, error: "This registration isn't on the waitlist." };

  const { error } = await updateEventRegistrations({ status: "registered", waitlist_position: null })
    .eq("id", registrationId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "event_registrations",
    recordId: registrationId,
    operation: "update",
    actor: admin.email,
    newData: { status: "registered", waitlist_position: null },
    context: { via: "event_roster_promote" },
  });
  refresh(eventId);
  return { ok: true };
}

// ─── Manual payment ──────────────────────────────────────────────────────────
// Attendees added by hand have no Stripe order, so there's no amount on the
// roster. This records a manual payment: it creates (or updates) a paid
// company_os.orders row for the attendee and links it to their registration,
// so the amount flows into the roster and the event revenue like any other.
// Clearing the amount (0 or blank) removes the manual order again.

export type RegistrationPaymentInput = { amountUsd: number | null; currency?: string };

export async function setRegistrationPayment(
  eventId: string,
  registrationId: string,
  input: RegistrationPaymentInput,
): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const { data: reg, error: rErr } = await companyOs
    .from("event_registrations")
    .select("id, person_id, product_id, order_id")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (rErr) return { ok: false, error: rErr.message };
  if (!reg) return { ok: false, error: "Registration not found." };
  if (!reg.person_id) return { ok: false, error: "This attendee has no linked person to bill." };

  // Clear: blank or zero removes any manual order and unlinks it.
  if (input.amountUsd == null || input.amountUsd === 0) {
    if (reg.order_id) {
      const { error: unlinkErr } = await updateEventRegistrations({ order_id: null }).eq("id", registrationId);
      if (unlinkErr) return { ok: false, error: unlinkErr.message };
      const { error: orderErr } = await deleteOrders()
        .eq("id", reg.order_id)
        .eq("payment_method", "manual");
      if (orderErr) return { ok: false, error: orderErr.message };
    }
    await recordAudit({
      table: "event_registrations",
      recordId: registrationId,
      operation: "update",
      actor: admin.email,
      newData: { payment: "cleared" },
      context: { event_id: eventId, via: "roster_payment" },
    });
    refresh(eventId);
    return { ok: true };
  }

  if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) {
    return { ok: false, error: "Enter a valid amount (0 or more)." };
  }
  const currency = (input.currency ?? "usd").toLowerCase();
  const amountCents = Math.round(input.amountUsd * 100);
  let amountUsdCents = amountCents;
  if (currency !== "usd") {
    try {
      amountUsdCents = (await convertToUsdCents(amountCents, currency)).amountUsdCents;
    } catch {
      amountUsdCents = amountCents;
    }
  }

  if (reg.order_id) {
    const { error } = await updateOrders({
        amount_cents: amountCents,
        currency,
        amount_usd_cents: amountUsdCents,
        status: "paid",
        payment_method: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reg.order_id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: order, error } = await insertOrders({
        person_id: reg.person_id,
        product_id: reg.product_id ?? null,
        payment_method: "manual",
        amount_cents: amountCents,
        tax_cents: 0,
        currency,
        amount_usd_cents: amountUsdCents,
        status: "paid",
        refunded_cents: 0,
        metadata: { via: "roster_manual_payment", event_id: eventId },
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    const { error: uErr } = await updateEventRegistrations({ order_id: order.id })
      .eq("id", registrationId);
    if (uErr) return { ok: false, error: uErr.message };
  }

  await recordAudit({
    table: "event_registrations",
    recordId: registrationId,
    operation: "update",
    actor: admin.email,
    newData: { payment_amount_cents: amountCents, currency },
    context: { event_id: eventId, via: "roster_payment" },
  });
  refresh(eventId);
  return { ok: true };
}
