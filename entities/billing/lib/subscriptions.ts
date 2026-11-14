// The question crm's revenue outlook asks of the recurring book (A.69, ADR
// 0018). Until A.69 the door handed out `selectSubscriptions(columns)` and the
// outlook passed its own column list; this makes exactly the query it made.
import { companyOs } from "@/kernel/data/supabase";

/**
 * Up to `limit` subscriptions, every status, with what the recurring forecast
 * needs: the product, the period end and whether it cancels then. The row
 * carries a `person_id` that this deliberately leaves out, because a figure
 * about the book is never a figure about a person.
 */
export async function subscriptionBook(limit: number) {
  return companyOs
    .from("subscriptions")
    .select("id, status, product_id, current_period_end, cancel_at_period_end")
    .limit(limit);
}
