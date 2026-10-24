// What a trip cost in reimbursements (plan section 11, RB.12): the claims
// naming the trip that have been PAID — a claim counts toward a trip's cost
// once the money has gone, not when it is asked for — summed by category and
// by person. Retreats' event P&L shows it through the TripCostPanel page slot,
// so retreats never names this entity.
//
// The amounts are whole VND: what each claim was approved and paid at, its
// declined receipts left out. Nothing here converts to the P&L's USD, because
// the rate is finance's and this entity does not require finance (design §2.1).
import { mustRows } from "@/kernel/data/read";
import { personName } from "@/kernel/config/people-name";
import { CLAIM_CATEGORY_LABEL, isClaimCategory } from "./categories";
import { CLAIM_OWNER_EMBED } from "./my-claims";
import { selectReimbursementClaimItems, selectReimbursementClaims } from "./reads";

export type TripCostLine = { label: string; vnd: number };
export type TripCost = { claims: number; totalVnd: number; byCategory: TripCostLine[]; byPerson: TripCostLine[] };

type PaidClaim = { id: string; ownerName: string; approvedTotalVnd: number };
type PaidItem = { claimId: string; category: string; amountVnd: number | null; declined: boolean; removed: boolean };

function sorted(totals: Map<string, number>): TripCostLine[] {
  return [...totals.entries()].map(([label, vnd]) => ({ label, vnd })).sort((a, b) => b.vnd - a.vnd || a.label.localeCompare(b.label));
}

/** The trip's paid cost from its paid claims and their receipts. Pure. */
export function tripCostOf(claims: PaidClaim[], items: PaidItem[]): TripCost {
  const byPerson = new Map<string, number>();
  for (const c of claims) byPerson.set(c.ownerName, (byPerson.get(c.ownerName) ?? 0) + c.approvedTotalVnd);
  const byCategory = new Map<string, number>();
  for (const i of items) {
    // Declined, or removed by its owner (20261008090000): never paid, never a cost.
    if (i.declined || i.removed || i.amountVnd === null) continue;
    const label = isClaimCategory(i.category) ? CLAIM_CATEGORY_LABEL[i.category] : i.category;
    byCategory.set(label, (byCategory.get(label) ?? 0) + i.amountVnd);
  }
  return {
    claims: claims.length,
    totalVnd: claims.reduce((sum, c) => sum + c.approvedTotalVnd, 0),
    byCategory: sorted(byCategory),
    byPerson: sorted(byPerson),
  };
}

/** The paid cost of the trip `eventId`. A must-read: a failed read is an error, never a trip that cost nothing. */
export async function readTripCost(eventId: string): Promise<TripCost> {
  const rows = mustRows(
    await selectReimbursementClaims(`id, approved_total_vnd, ${CLAIM_OWNER_EMBED}`).eq("trip_event_id", eventId).eq("status", "paid"),
    "[reimbursements] a trip's paid claims",
  );
  const claims: PaidClaim[] = rows.map((c) => ({
    id: String(c.id),
    ownerName: personName((c.owner ?? null) as Parameters<typeof personName>[0], "Someone"),
    approvedTotalVnd: Number(c.approved_total_vnd ?? 0),
  }));
  if (claims.length === 0) return tripCostOf([], []);
  const items = mustRows(
    await selectReimbursementClaimItems("claim_id, category, amount_vnd, declined_at, removed_at").in(
      "claim_id",
      claims.map((c) => c.id),
    ),
    "[reimbursements] a trip's paid receipts",
  ).map((i) => ({
    claimId: String(i.claim_id),
    category: String(i.category),
    amountVnd: i.amount_vnd === null || i.amount_vnd === undefined ? null : Number(i.amount_vnd),
    declined: Boolean(i.declined_at),
    removed: Boolean(i.removed_at),
  }));
  return tripCostOf(claims, items);
}
