// Client-safe P&L types, constants, labels, and the pure totals function.
// No server-only imports here (event-pnl.ts, which pulls in the service-role
// client, re-exports everything from this file), so the P&L tab client
// component can import from here without dragging secrets into the bundle.

export type PnlSide = "revenue" | "expense";
export type PnlPaymentStatus = "unpaid" | "to_be_paid" | "paid";

// Flat v1 staff rate. The leak guard: retreat cost lines must never expose real
// wages, so staff cost is a fixed $150/day, not the compensation table.
export const STAFF_DAY_RATE_USD_CENTS = 15000; // $150/day

export const EXPENSE_CLASSIFICATIONS = [
  "accommodation",
  "staff_cost",
  "venue",
  "transportation",
  "food_beverage",
  "equipment",
  "visa",
  "commission",
  "stripe_fee",
  "other",
] as const;

export const REVENUE_CLASSIFICATIONS = ["retreat", "human_tokens", "mac_mini", "other"] as const;

export const CLASSIFICATION_LABELS: Record<string, string> = {
  accommodation: "Accommodation",
  staff_cost: "Staff cost",
  venue: "Venue",
  transportation: "Transportation",
  food_beverage: "Food & beverage",
  equipment: "Equipment",
  visa: "Visa",
  commission: "Commission",
  stripe_fee: "Stripe fee",
  retreat: "Retreat fee",
  human_tokens: "Human Tokens",
  mac_mini: "Mac Mini",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PnlPaymentStatus, string> = {
  unpaid: "Unpaid",
  to_be_paid: "To be paid",
  paid: "Paid",
};

export type PnlLine = {
  id: string;
  eventId: string;
  side: PnlSide;
  classification: string;
  description: string | null;
  personId: string | null;
  attendees: number | null;
  staffDays: number | null;
  estimatedCents: number | null;
  estimatedCurrency: string | null;
  estimatedUsdCents: number | null;
  actualCents: number | null;
  actualCurrency: string | null;
  actualUsdCents: number | null;
  paymentStatus: PnlPaymentStatus;
  note: string | null;
  sortOrder: number;
};

export type PnlLineInput = {
  side: PnlSide;
  classification: string;
  description?: string | null;
  personId?: string | null;
  attendees?: number | null;
  staffDays?: number | null;
  estimatedCents?: number | null;
  estimatedCurrency?: string | null;
  actualCents?: number | null;
  actualCurrency?: string | null;
  paymentStatus?: PnlPaymentStatus;
  note?: string | null;
  sortOrder?: number;
};

// Pure totals (all in USD cents). `autoRevenueUsdCents` is the read-only Stripe
// revenue already captured via orders, added to the manual revenue lines.
export type PnlSummary = {
  revenueEstimatedUsd: number;
  revenueActualUsd: number;
  expenseEstimatedUsd: number;
  expenseActualUsd: number;
  profitEstimatedUsd: number;
  profitActualUsd: number;
};

export function summarizePnl(lines: PnlLine[], autoRevenueUsdCents = 0): PnlSummary {
  let revEst = autoRevenueUsdCents;
  let revAct = autoRevenueUsdCents;
  let expEst = 0;
  let expAct = 0;
  for (const l of lines) {
    if (l.side === "revenue") {
      revEst += l.estimatedUsdCents ?? 0;
      revAct += l.actualUsdCents ?? 0;
    } else {
      expEst += l.estimatedUsdCents ?? 0;
      expAct += l.actualUsdCents ?? 0;
    }
  }
  return {
    revenueEstimatedUsd: revEst,
    revenueActualUsd: revAct,
    expenseEstimatedUsd: expEst,
    expenseActualUsd: expAct,
    profitEstimatedUsd: revEst - expEst,
    profitActualUsd: revAct - expAct,
  };
}
