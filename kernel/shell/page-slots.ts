// What one entity's page may take from another entity it does not require
// (W.169.4, ADR 0002). A page names the SHAPE of what it can show here; the
// composition root decides who provides it: app/shell.ts holds the provider
// when the deployment installs it and null otherwise, and the generated mount
// passes it to the page (an entity's mounts.ts asks for it under `slots`). So
// My Week, which boards owns, can carry a line from the Inbox, which
// notifications owns, without boards requiring notifications — a deployment
// without an inbox simply passes nothing.
import type { ReactNode } from "react";

/** One line about the reader's unread inbox, or nothing when there is nothing new. */
export type InboxLineSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/** The reader's own reimbursement claims, on their profile (the plan's "Profile → Reimbursements"). */
export type ProfileClaimsSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/** What a trip (an event) cost in paid reimbursement claims, on the event's P&L. */
export type TripCostSlot = ((props: { eventId: string }) => Promise<ReactNode>) | null;
