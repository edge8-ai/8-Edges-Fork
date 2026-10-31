// The questions other entities ask of the expense ledger (A.65, ADR 0018):
// crm's runway reads the burn, and the team assistant reads a period's
// spending. Each makes exactly the query its caller used to build by hand
// around `selectExpenses(columns)`.
import { companyOs } from "@/kernel/data/supabase";

/**
 * Expenses incurred on or after `from`, up to twenty thousand. The cap is far
 * above a burn window's rows on purpose: a truncated cost read understates
 * burn, which lengthens the runway.
 */
export async function expensesSince(from: string) {
  return companyOs.from("expenses").select("id, amount_cents, currency, incurred_on").gte("incurred_on", from).limit(20000);
}

/** What was spent between two dates, inclusive, in each expense's own currency. */
export async function expensesBetween(from: string, to: string) {
  return companyOs.from("expenses").select("amount_cents, currency").gte("incurred_on", from).lte("incurred_on", to);
}
