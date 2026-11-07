// The slots billing provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** One order a person placed, as the contact page lists it. */
export type PersonOrder = {
  id: string;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  status: string | null;
  payment_method: string | null;
  created_at: string;
};

/** One booking a person made, as the contact page lists it. */
export type PersonBooking = {
  id: string;
  kind: string | null;
  start_date: string | null;
  end_date: string | null;
  party_size: number | null;
  amount_cents: number | null;
  amount_usd_cents: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
};

/** What a person bought, newest first. */
export type PersonPurchases = { orders: PersonOrder[]; bookings: PersonBooking[] };

/** A person's orders and bookings; null when billing is not installed. */
export type PersonPurchasesSlot = ((personId: string) => Promise<PersonPurchases>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // ADR 0032: a contact's orders and bookings are billing's enrichment of
  // crm's contact page. A CRM is complete without billing, so the page takes
  // them here and, in a deployment without billing, shows neither tab.
  personPurchases: {
    kind: "value",
    type: "PersonPurchasesSlot",
    fallback: "null",
    styles: [],
    surfaces: ["admin"],
    why: "a contact's orders and bookings on crm's contact page; neither tab without billing",
  },
};
