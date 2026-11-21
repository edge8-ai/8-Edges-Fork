import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { EXIT_AGREEMENT, EXIT_DECIDED } from "@/entities/hiring/lib/chain/shadow";
import type { RequisitionChainView } from "@/entities/hiring/lib/chain/view";

// What the chain would have done (Z.9, spec section 10): each application a
// shadow round covered, the lane the chain proposed, what a person actually
// did, and the message it drafted and did not send. Counted, never judged by
// the chain; going live is Khoa's switch once the counts are met.

const LANE_WORD = { advance: "Advance", decline: "Decline", hold: "Hold" } as const;
const HUMAN_WORD = { advanced: "Advanced to an interview", rejected: "Rejected", open: "Still open" } as const;
const MATCH_TONE = { match: "ok", differs: "err", open: "neutral" } as const;
const MATCH_WORD = { match: "Match", differs: "Differs", open: "Open" } as const;

export function ShadowComparison({ shadow }: { shadow: NonNullable<RequisitionChainView["shadow"]> }) {
  const pct = shadow.decided > 0 ? Math.round((shadow.agreed / shadow.decided) * 100) : null;
  return (
    <section className="admin-card admin-section-card u-mb-5" aria-label="Shadow comparison">
      <div className="u-row u-between u-wrap u-gap-2 u-mb-2">
        <h2 className="admin-card-title u-m-0">What the chain would have done</h2>
        <Badge tone="warn">Shadow</Badge>
      </div>
      <p className="admin-hint u-m-0 u-mb-3">
        {shadow.rounds} shadow round{shadow.rounds === 1 ? "" : "s"}. Agreement so far: <strong>{shadow.agreed} of {shadow.decided}</strong> decided applications
        {pct !== null ? ` (${pct}%)` : ""}. Going live needs at least {EXIT_DECIDED} decided and {Math.round(EXIT_AGREEMENT * 100)}% agreement, among the other counts in the runbook.
      </p>
      <div className="admin-table-wrap admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Candidate</th>
              <th scope="col">Chain proposed</th>
              <th scope="col">What happened</th>
              <th scope="col">Match</th>
              <th scope="col">Message it drafted</th>
            </tr>
          </thead>
          <tbody>
            {shadow.rows.map((r) => (
              <tr key={r.applicationId}>
                <td><Link href={`/admin/talent/applications/${r.applicationId}`}>{r.name}</Link></td>
                <td>{LANE_WORD[r.lane]}</td>
                <td>{HUMAN_WORD[r.human]}</td>
                <td><Badge tone={MATCH_TONE[r.match]}>{MATCH_WORD[r.match]}</Badge></td>
                <td className="admin-cell-muted">{r.message ?? "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
