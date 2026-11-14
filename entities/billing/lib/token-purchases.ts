// The acts the client portal performs on token_purchases when a client buys
// human-token packs (A.69, ADR 0018). Until A.69 the door handed out
// `insertTokenPurchases` and `updateTokenPurchases`, and the portal's checkout
// action built each statement itself. Each command here makes exactly the
// statement it made.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert } from "@/kernel/data/supabase/database.types";

type TokenPurchaseInsert = TablesInsert<{ schema: "company_os" }, "token_purchases">;

/** Opens a pending token purchase and answers its id. The caller has priced the packs and scoped the company. */
export async function startTokenPurchase(row: TokenPurchaseInsert) {
  return companyOs.from("token_purchases").insert(row).select("id").single();
}

/** Links a token purchase to the order that will pay for it. */
export async function linkTokenPurchaseOrder(purchaseId: string, orderId: string) {
  return companyOs.from("token_purchases").update({ order_id: orderId }).eq("id", purchaseId);
}

/** Stamps the Stripe Checkout session that will pay for this token purchase. */
export async function stampTokenPurchaseSession(purchaseId: string, sessionId: string) {
  return companyOs.from("token_purchases").update({ stripe_session_id: sessionId }).eq("id", purchaseId);
}

/**
 * Expires a token purchase whose checkout never started. With `pendingOnly`
 * the purchase is expired only while it is still pending; without it, the
 * order that would have paid for it was never opened, so nothing could have
 * moved it on.
 */
export async function expireTokenPurchase(purchaseId: string, pendingOnly: boolean) {
  const query = companyOs.from("token_purchases").update({ status: "expired" }).eq("id", purchaseId);
  return pendingOnly ? query.eq("status", "pending") : query;
}

/**
 * Companies' token purchases, newest first: what the Human Token Tracker counts
 * as bought (htt/lib/hub-tokens.ts, ADR 0032). The caller has authorised the
 * company ids.
 */
export async function tokenPurchasesOfCompanies(companyIds: string[]) {
  return companyOs
    .from("token_purchases")
    .select("id, packs, tokens, amount_cents, status, created_at, paid_at")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false });
}
