// Operator contact addresses. Read from the environment, with no hardcoded
// fallback, so a fork never mails the previous owner or signs mail as them.
//
// The failure mode a default protects against — an unset variable — is loud and
// fixable. The failure mode a default CAUSES is silent: a client's contact form
// delivering to another company's inbox, which is what a hardcoded address
// fallback did before this file existed. Server-only; none of these are
// NEXT_PUBLIC.
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Where operational mail goes when nothing more specific is configured. */
export const OPS_EMAIL = process.env.OPS_EMAIL || adminEmails[0] || "";

/**
 * The bookkeeper's mailbox (accounting@): told when a reimbursement claim is
 * submitted, when a payment run is built and when it is paid, each with a
 * link and never a bank detail. No fallback, for the reason at the top of this
 * file: unset, those notices are skipped and logged. Read at call time, so an
 * environment change reaches a warm instance without a redeploy and a test can
 * set it.
 */
export function accountingEmail(): string | null {
  return (process.env.ACCOUNTING_EMAIL ?? "").trim() || null;
}

/** Reply-to for event and registration mail. Falls back to the ops address. */
export const EVENTS_EMAIL = process.env.EVENTS_EMAIL || OPS_EMAIL;

/** How outbound mail signs off.
 *
 *  Ten emails across five files carried a hardcoded sign-off naming the
 *  upstream's founder and brand — the
 *  contractor request, estimate, approval and payment notices, the portal
 *  invite, the bank-details alert, the retreat confirmation and the order
 *  receipt. Not a page someone might visit: mail a fork SENDS, to its own
 *  contractors and paying customers, over the upstream's founder's name.
 *
 *  No hardcoded fallback, for the reason at the top of this file. Unset, the
 *  sign-off line is omitted and the mail simply ends after its last paragraph.
 */
export const EMAIL_SIGN_OFF =
  (process.env.EMAIL_SIGN_OFF ?? "").trim() ||
  ((process.env.NEXT_PUBLIC_ORG_NAME ?? "").trim()
    ? `the ${(process.env.NEXT_PUBLIC_ORG_NAME ?? "").trim()} team`
    : "");
