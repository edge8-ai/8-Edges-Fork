// The questions other entities ask of orders and the acts they perform on them
// (A.69, ADR 0018). Until A.69 the door handed out `selectOrders(columns)`,
// `insertOrders`, `updateOrders` and `deleteOrders`, and crm, the team
// assistant, the client portal and retreats each built their own statement.
// Each question and command here makes exactly the statement its caller made.
//
// Every order a checkout opens starts `pending`; the Stripe webhook is the
// payment truth. What a caller may do to an order before then is named here:
// stamp the Checkout session on it, or expire it while it is still pending.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

type OrderInsert = TablesInsert<{ schema: "company_os" }, "orders">;

const NEWEST = { ascending: false } as const;

/** One person's orders, newest first: the orders tab of their CRM record. */
export async function ordersOfPerson(personId: string) {
  return companyOs
    .from("orders")
    .select("id, amount_cents, amount_usd_cents, currency, status, payment_method, created_at")
    .eq("person_id", personId)
    .order("created_at", NEWEST);
}

/** Up to `limit` orders, every status, with their date and USD amount: the revenue overview's Stripe cash. */
export async function orderFigures(limit: number) {
  return companyOs.from("orders").select("created_at, amount_usd_cents, status").limit(limit);
}

/** The USD amount of every paid order created between two instants, both included: company-wide cash for a period. */
export async function paidOrdersBetween(fromInstant: string, toInstant: string) {
  return companyOs
    .from("orders")
    .select("amount_usd_cents")
    .eq("status", "paid")
    .gte("created_at", fromInstant)
    .lte("created_at", toInstant);
}

/** The 100 newest orders these people placed, every status: one client's purchases, as the team assistant summarises them. */
export async function latestOrdersOfPeople(personIds: string[]) {
  return companyOs
    .from("orders")
    .select("created_at, status, amount_cents, currency, amount_usd_cents, refunded_cents, product_id")
    .in("person_id", personIds)
    .order("created_at", NEWEST)
    .limit(100);
}

/**
 * Opens an order and answers its id: a pending one for a Stripe checkout, or
 * a paid manual one an admin records against an event registration. The
 * caller has already worked out the amounts and the metadata that ties the
 * order to what it pays for.
 */
export async function openOrder(row: OrderInsert) {
  return companyOs.from("orders").insert(row).select("id").single();
}

/** Stamps the Stripe Checkout session that will pay this order. */
export async function stampOrderSession(orderId: string, sessionId: string) {
  return companyOs.from("orders").update({ stripe_session_id: sessionId }).eq("id", orderId);
}

/** Expires an order whose checkout never started, only while it is still pending, so a payment that did land is never undone. */
export async function expirePendingOrder(orderId: string) {
  return companyOs.from("orders").update({ status: "expired" }).eq("id", orderId).eq("status", "pending");
}

/** Records an admin's manual payment on an existing order: the amount, its currency and USD value, paid, by hand. */
export async function recordManualOrderPayment(
  orderId: string,
  payment: { amountCents: number; currency: string; amountUsdCents: number },
) {
  return companyOs
    .from("orders")
    .update({
      amount_cents: payment.amountCents,
      currency: payment.currency,
      amount_usd_cents: payment.amountUsdCents,
      status: "paid",
      payment_method: "manual",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}

/** Erases an order only if it was recorded by hand; a Stripe order is never erased this way. */
export async function eraseManualOrder(orderId: string) {
  return companyOs.from("orders").delete().eq("id", orderId).eq("payment_method", "manual");
}
