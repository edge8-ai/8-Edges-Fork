// One row of the approvals inbox (Z.2.1): what it is and its tier, its title,
// who asked and whose decision it is; then either leave's Approve and Decline,
// or a link to the page it is decided on; and a Details toggle over the facts
// its approval carries. Rendered by ApprovalsInbox, which holds every state.
import Link from "next/link";
import { useId } from "react";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";

export type InboxEntry = {
  id: string;
  subjectId: string;
  subject: string;
  tier: 0 | 1 | 2;
  tierChip: string;
  title: string;
  askedBy: string;
  asked: string;
  namedOnMe: boolean;
  whose: string;
  inline: boolean;
  href: string | null;
  cta: string;
  facts: { label: string; value: string }[];
};

const TIER_TONE: Record<InboxEntry["tier"], BadgeTone> = { 2: "warn", 1: "info", 0: "neutral" };

export function ApprovalRow({
  entry,
  open,
  pending,
  onToggle,
  onDecide,
}: {
  entry: InboxEntry;
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  onDecide: (decision: "approved" | "rejected") => void;
}) {
  const factsId = useId();
  return (
    <article className="admin-approval">
      <div className="admin-approval-head">
        <div className="admin-approval-main">
          <div className="admin-approval-eyebrow">
            <span className="admin-approval-subject">{entry.subject}</span>
            <Badge tone={TIER_TONE[entry.tier]}>{entry.tierChip}</Badge>
          </div>
          <div className="admin-approval-title">{entry.title}</div>
          <div className="admin-approval-meta">
            {entry.askedBy} · asked {entry.asked} · <strong>{entry.whose}</strong>
          </div>
        </div>
        <div className="admin-approval-actions">
          {entry.inline && (
            <>
              <button type="button" className="admin-btn admin-btn--primary" disabled={pending} onClick={() => onDecide("approved")}>
                Approve
              </button>
              <button type="button" className="admin-btn" disabled={pending} onClick={() => onDecide("rejected")}>
                Decline
              </button>
            </>
          )}
          {!entry.inline && entry.href && (
            <Link href={entry.href} className="admin-btn admin-approval-cta">
              {entry.cta}
            </Link>
          )}
          <button type="button" className="admin-btn-reset admin-approval-toggle" aria-expanded={open} aria-controls={factsId} onClick={onToggle}>
            {open ? "Less" : "Details"}
          </button>
        </div>
      </div>
      {open && (
        <dl id={factsId} className="admin-approval-facts">
          {entry.facts.map((f) => (
            <div key={f.label} className="admin-approval-fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
