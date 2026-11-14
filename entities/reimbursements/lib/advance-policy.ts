// The advances policy (quy chế tạm ứng) as numbers (AD.3). The Handbook quotes
// these, and the two must agree: the plan's definition of done checks it.
//
// Client-safe: no imports.

/**
 * Whether people can ask for an advance. Off while the road was being built, because nobody
 * should hold a request or money with no way to finish it. AD.14 turned it on, once asking,
 * the approver's decision, Finance's transfer and the settlement were all live. Turning it off
 * again stops new requests and hides the Finance entries, and leaves open advances on file.
 */
export const ADVANCES_OPEN = true;

/** The most one advance may be, in whole VND. The database only holds "above zero", so this can change without a migration. */
export const ADVANCE_MAX_VND = 10_000_000;

/** How many working days a person has to settle, counted from the later of the spend and the payout. */
export const SETTLE_WORKING_DAYS = 10;

/** How many working days before the deadline the reminder goes. */
export const REMINDER_WORKING_DAYS = 3;
