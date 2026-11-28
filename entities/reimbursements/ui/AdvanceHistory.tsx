import { formatDate } from "@/kernel/ui/format";
import type { AdvanceEvent } from "@/entities/reimbursements/lib/advance-history";

// An advance's history, newest first, the same on its owner's page and its approver's.
// Only the transfer reads differently, because only one of them received it.
const MOVE_WORDS: Record<string, string> = {
  create: "Started",
  submit: "Asked",
  withdraw: "Withdrawn",
  cancel: "Cancelled",
  approve: "Approved",
  send_back: "Sent back",
  reject: "Rejected",
  close: "Settlement approved",
  return_unspent: "Returning all of it",
  confirm_return: "A return arrived",
  reinstate: "Put back by Finance",
};

export function AdvanceHistory({ events, viewer }: { events: AdvanceEvent[]; viewer: "owner" | "decider" }) {
  const words = (move: string) => (move === "pay_out" ? (viewer === "owner" ? "Sent to you" : "Sent") : (MOVE_WORDS[move] ?? move));
  return (
    <section className="admin-card admin-section-card">
      <h2 className="admin-card-title">History</h2>
      <div className="admin-list">
        {events.map((event) => (
          <div key={event.id} className="admin-list-row">
            <div className="admin-list-main">
              <div className="admin-list-title">
                {words(event.move)}
                {event.actorName && <span className="admin-cell-muted"> · {event.actorName}</span>}
              </div>
              {event.reason && <div className="admin-list-sub">{event.reason}</div>}
            </div>
            <div className="admin-list-aside"><span className="admin-list-sub">{formatDate(event.at)}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}
