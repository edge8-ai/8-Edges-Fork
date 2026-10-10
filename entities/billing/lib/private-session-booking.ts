import { companyOs } from "@/kernel/data/supabase";

// The Saigon private retreat's order + booking, written once Stripe checkout
// starts. Moved out of kernel/data/company-os.ts in ME-13: billing owns
// `orders` and, since it is the only writer, `bookings` too (design §4).

// Best-effort booking + order for the Saigon private retreat. Never throws —
// the lead (people + inquiries) is the authoritative record; this enriches it.
export async function recordPrivateSessionBooking(input: {
  personId: string;
  inquiryId: string | null;
  startDate: string;
  endDate: string;
  teamSize: number;
  amountCents: number;
  stripeSessionId: string | null;
  idea: string | null;
  days: number;
}): Promise<void> {
  try {
    let orderId: string | null = null;
    const { data: order, error: orderErr } = await companyOs
      .from("orders")
      .insert({
        person_id: input.personId,
        payment_method: "stripe",
        stripe_session_id: input.stripeSessionId,
        amount_cents: input.amountCents,
        currency: "usd",
        status: "pending",
        metadata: { event: "saigon-private", inquiry_id: input.inquiryId },
      })
      .select("id")
      .single();
    if (orderErr) console.error("[company-os] order insert failed:", orderErr.message);
    else orderId = order.id;

    const { error: bookErr } = await companyOs.from("bookings").insert({
      person_id: input.personId,
      order_id: orderId,
      kind: "private_session",
      start_date: input.startDate,
      end_date: input.endDate,
      party_size: input.teamSize,
      amount_cents: input.amountCents,
      currency: "usd",
      status: "pending",
      metadata: { idea: input.idea, inquiry_id: input.inquiryId, days: input.days },
    });
    if (bookErr) console.error("[company-os] booking insert failed:", bookErr.message);
  } catch (e) {
    console.error("[company-os] recordPrivateSessionBooking failed:", e);
  }
}
