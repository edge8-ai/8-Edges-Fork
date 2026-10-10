// The TripCostPanel page slot (app/shell.ts, design §2.1): on retreats' event
// P&L, what the trip cost in paid reimbursement claims, by category, and by
// person for a viewer who may see claims. Retreats renders whatever the slot
// holds and never names this entity; a deployment without reimbursements
// passes nothing.
//
// The P&L page's own guard decides who reaches the page. What a person was
// reimbursed is only shown to someone whose access already reaches every
// claim (reimbursements.view) or the runs that paid them (reimbursements.pay);
// everyone else on the P&L sees the totals by category.
import { getAccess } from "@/kernel/identity/access-request";
import { formatVndWhole } from "@/kernel/ui/format";
import { readTripCost, type TripCostLine } from "../lib/trip-cost";

function Lines({ title, lines }: { title: string; lines: TripCostLine[] }) {
  return (
    <div className="u-stack u-gap-1">
      <span className="admin-label">{title}</span>
      {lines.map((l) => (
        <div key={l.label} className="u-row u-between u-gap-2">
          <span>{l.label}</span>
          <span className="admin-cell-mono">{formatVndWhole(l.vnd)}</span>
        </div>
      ))}
    </div>
  );
}

export async function TripCostPanel({ eventId }: { eventId: string }) {
  const [cost, access] = await Promise.all([readTripCost(eventId), getAccess()]);
  const seesPeople = !!access && (access.may("reimbursements.view") || access.may("reimbursements.pay"));
  return (
    <section className="admin-card admin-section-card">
      <div className="u-row u-between u-items-center u-wrap u-gap-1">
        <h2 className="admin-card-title">Reimbursed event costs</h2>
        <span className="admin-cell-mono u-strong">{formatVndWhole(cost.totalVnd)}</span>
      </div>
      <p className="admin-hint">
        Paid reimbursement claims that name this trip, in VND as they were paid. A claim counts once it is paid.
        {cost.claims > 0 ? ` ${cost.claims} ${cost.claims === 1 ? "claim" : "claims"}.` : ""}
      </p>
      {cost.claims === 0 ? (
        <div className="admin-empty">No paid claim names this event yet.</div>
      ) : (
        <div className="u-stack u-gap-3">
          <Lines title="By category" lines={cost.byCategory} />
          {seesPeople && <Lines title="By person" lines={cost.byPerson} />}
        </div>
      )}
    </section>
  );
}
