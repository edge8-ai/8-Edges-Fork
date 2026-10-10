// What an invoice bills, read off its QuickBooks line items (2026-09-13).
// The Billing tab's "steady band is the recurring book" used to be a guess;
// this makes it a column. Pure, so the vocabulary is tested without QBO.
//
// Recurring: a retainer, a monthly or annual fee, a subscription, a staffing
// or placement month, hours billed on a standing engagement. Project: a
// sprint, a build, a workshop, a retreat seat, a one-off deliverable. When
// no line says either, null: the Data health tab counts those and the sync
// leaves them for a human to name.

export type InvoiceLine = { item_name?: string | null; description?: string | null };

export type InvoiceKind = "recurring" | "project";

const RECURRING = /\b(retainer|monthly|per month|\/mo\b|annual|yearly|subscription|recurring|staffing|placement|dedicated|managed service|support plan|maintenance|hours?\b.*\b(month|week)|ongoing)\b/i;
const PROJECT = /\b(sprint|build|workshop|retreat|seat|ticket|deposit|milestone|phase|setup|set-up|onboarding fee|audit|assessment|training|course|certification|one-?off|project|implementation|design|pilot)\b/i;

export function classifyInvoiceKind(lines: InvoiceLine[] | null | undefined, memo?: string | null): InvoiceKind | null {
  const texts = (lines ?? []).map((l) => `${l.item_name ?? ""} ${l.description ?? ""}`);
  if (memo) texts.push(memo);
  let recurring = 0;
  let project = 0;
  for (const t of texts) {
    if (RECURRING.test(t)) recurring++;
    if (PROJECT.test(t)) project++;
  }
  if (recurring === 0 && project === 0) return null;
  // A retainer invoice that also lists a workshop is still the retainer; the
  // majority of lines decides, recurring on a tie because that is the standing
  // relationship the one-off sat inside.
  return recurring >= project ? "recurring" : "project";
}
