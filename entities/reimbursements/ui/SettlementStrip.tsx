import { formatVndWhole } from "@/kernel/ui/format";

// A settlement's three figures, the same wherever it is read: what was advanced, what the
// receipts come to, and the difference. Only the last says who it falls on, and it says
// nothing while a receipt waits for a rate, because a partial spend gives a false difference.
export function SettlementStrip({ advancedVnd, spentVnd, viewer, ratePending = 0 }: { advancedVnd: number; spentVnd: number; viewer: "owner" | "decider"; ratePending?: number }) {
  const balance = spentVnd - advancedVnd;
  const who = viewer === "owner" ? { pays: "The company pays you", owes: "You return" } : { pays: "The company pays them", owes: "They return" };
  return (
    <div className="adv-strip">
      <div><small>Advanced</small><b>{formatVndWhole(advancedVnd)}</b></div>
      <div><small>{ratePending > 0 ? "Spent so far, receipts kept" : "Spent, receipts kept"}</small><b>{formatVndWhole(spentVnd)}</b></div>
      {ratePending > 0 ? (
        <div>
          <small>Difference</small>
          <b>Waits for a rate</b>
        </div>
      ) : (
        <div className={balance > 0 ? "is-pos" : balance < 0 ? "is-neg" : ""}>
          <small>{balance > 0 ? who.pays : balance < 0 ? who.owes : "Difference"}</small>
          <b>{formatVndWhole(Math.abs(balance))}</b>
        </div>
      )}
    </div>
  );
}
