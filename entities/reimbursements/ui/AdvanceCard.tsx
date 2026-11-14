// The open advance on My Claims (AD.5): what it is, the figure that matters now, and
// how long is left, so the money someone is holding is the first thing they see.
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, formatVndWhole } from "@/kernel/ui/format";
import { heroOf, owedOf, ringOf } from "../lib/advance-card";
import { ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE, advanceRef, isOverdue, isSettling } from "../lib/advance-rules";
import type { MyAdvanceCard } from "../lib/my-advances";

/** How far the ring counts from: the ten working days plus what a spend date ahead can add. */
const RING_DAYS = 20;

export function AdvanceCard({ advance, today }: { advance: MyAdvanceCard; today: string }) {
  const { row, facts, daysLeft } = advance;
  const hero = heroOf(facts, today);
  const page = `/team/claims/advances/${row.id}`;
  const settling = isSettling({ status: row.status, claimStatus: facts.claimStatus });
  const overdue = isOverdue({ status: row.status, settleBy: row.settleBy, claimStatus: facts.claimStatus }, today);
  const action =
    row.status === "draft"
      ? { label: "Finish and send", href: `${page}/edit` }
      : row.status === "sent_back"
        ? { label: "Fix and send again", href: `${page}/edit` }
        : row.status === "to_return" && !facts.returnReported
          ? { label: `Return ${formatVndWhole(owedOf(facts))}`, href: page }
          : null;
  const spent = facts.spentVnd;
  const scale = spent === null ? facts.amountVnd : Math.max(facts.amountVnd, spent);
  const showRing = row.status === "paid_out" && !settling && row.settleBy !== null;
  const ring = showRing && daysLeft !== null ? ringOf(daysLeft, overdue, RING_DAYS) : null;

  return (
    <section className="admin-card admin-section-card">
      <div className="adv-hero">
        <div className="u-min-0">
          <p className="adv-eyebrow">
            Advance {advanceRef(row.refNo)} · <Badge tone={ADVANCE_STATUS_TONE[row.status]}>{ADVANCE_STATUS_LABEL[row.status]}</Badge>
          </p>
          <p className="adv-purpose">{row.purpose}</p>
          <p className="adv-big">{hero.figure}</p>
          <p className="admin-list-sub u-m-0">{hero.line}</p>
          {spent !== null && (
            <svg className="adv-meter" viewBox="0 0 100 14" preserveAspectRatio="none" role="img" aria-label={`${formatVndWhole(spent)} of receipts against ${formatVndWhole(facts.amountVnd)} advanced`}>
              <rect className="adv-meter-fill" width={(Math.min(spent, facts.amountVnd) / scale) * 100} height="14" />
              {spent > facts.amountVnd && <rect className="adv-meter-over" x={(facts.amountVnd / scale) * 100} width={((spent - facts.amountVnd) / scale) * 100} height="14" />}
            </svg>
          )}
          <div className="u-row u-gap-1 u-mt-4">
            {action && <Link className="admin-btn admin-btn--primary" href={action.href}>{action.label}</Link>}
            <Link className="admin-btn" href={page}>Open the advance</Link>
          </div>
        </div>
        {showRing && (
          <div>
            {ring && (
              <div className="adv-ring" data-tone={ring.tone}>
                <svg className="adv-ring-svg" viewBox="0 0 150 150" aria-hidden="true">
                  <circle className="adv-ring-track" cx="75" cy="75" r="66" pathLength={360} />
                  <circle className="adv-ring-arc" cx="75" cy="75" r="66" pathLength={360} strokeDasharray={`${ring.degrees} 360`} />
                </svg>
                <div className="adv-ring-in">
                  <span className="adv-ring-n">{overdue ? "!" : daysLeft}</span>
                  <span className="adv-ring-l">{overdue ? "past the date" : "working days left to settle"}</span>
                </div>
              </div>
            )}
            <p className="adv-ring-d">Settle by {formatDate(row.settleBy)}</p>
          </div>
        )}
        {row.status === "settled" && <div className="adv-seal">Settled</div>}
      </div>
    </section>
  );
}
