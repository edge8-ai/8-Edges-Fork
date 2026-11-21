// The slots reimbursements provides (ADR 0026). The generator
// (scripts/gen-deployment.mjs) reads `slots` and writes app/shell.ts from it;
// nothing imports it.
import type { ReactNode } from "react";
import type { SlotDeclarations } from "@/kernel/shell/page-slots";

/** What a trip (an event) cost in paid reimbursement claims, on the event's P&L. */
export type TripCostSlot = ((props: { eventId: string }) => Promise<ReactNode>) | null;
/** What waits on the viewer in reimbursements, on Home: claims to check, to approve, or approved and waiting to be paid. Nothing for anyone else. */
export type HomeClaimsSlot = (() => Promise<ReactNode>) | null;

/** @generator */
export const slots: SlotDeclarations = {
  // The plan's "a claim counts toward its trip's cost once paid" (RB.12):
  // retreats' event P&L, on Admin and on Team, shows a trip's paid claims
  // without retreats naming the entity that owns them.
  TripCostPanel: {
    kind: "component",
    type: "TripCostSlot",
    styles: [],
    surfaces: ["admin", "team"],
    why: "a trip's paid reimbursement claims on its event P&L; nothing when reimbursements is not installed",
  },
  // The Reimbursements card on Home (Dave, 2026-10-12): what waits on the
  // checker, the approver and the payer, front and center, without team
  // naming the entity that owns the claims. It draws with Home's own sheet.
  HomeClaims: {
    kind: "component",
    type: "HomeClaimsSlot",
    styles: [],
    surfaces: ["team"],
    why: "the claims waiting on the viewer, on Home; nothing when reimbursements is not installed",
  },
};
