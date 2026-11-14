"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { ReviewDecision, type Decided, type ReviewDecisionProps } from "./ReviewDecision";

// A decider's working view of one claim (RB.14): its receipts as rows to work
// through, each opening onto its document, what the AI read beside what was
// claimed, and the controls for that receipt, which the page builds and hands
// in; and beside them the one decision. What lives here is only what the
// decider does with their eyes: which receipt is open, which they have looked
// at. A checker passes a claim on only once every receipt is looked at;
// opening one counts. That is a habit the page asks for, not a rule the
// server keeps: the lifecycle module decides what may be checked.

export type ReviewRow = {
  id: string;
  title: string;
  sub: string;
  /** The receipt's value as ItemValue shows it. */
  value: ReactNode;
  chip: { tone: BadgeTone; label: string | null };
  /** What opens under the row: the document, the comparison, the receipt's controls. */
  detail: ReactNode;
  /** Whether the decider is asked to look at it: a removed receipt counts for nothing. */
  counts: boolean;
  /** Declined or removed: drawn struck through. */
  struck: boolean;
};

export type ReviewWorkspaceProps = {
  rows: ReviewRow[];
  /** The receipts card's summary line: "3 match the AI reading · 1 to look at". */
  summary: string;
  /** The decision, handed in only when this viewer may make one now; `seen` is filled in here. */
  decision?: Omit<ReviewDecisionProps, "seen" | "onDone"> & { requireSeen: boolean };
  /** After a decision: the next claim in the decider's queue, or the queue itself. */
  next: { href: string; label: string };
  /** The cards under the decision: a note from the checker, the trip, the history. */
  aside: ReactNode;
  /** The receipt open on arrival: the first one with something to look at; it counts as looked at. */
  initialOpen: string | null;
};

export function ReviewWorkspace({ rows, summary, decision, next, aside, initialOpen }: ReviewWorkspaceProps) {
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(initialOpen ? [initialOpen] : []));
  // Kept here, not in the decision: the page refreshes once the decision is
  // saved and hands in no decision, and the result must outlive that.
  const [decided, setDecided] = useState<Decided | null>(null);
  const counted = rows.filter((r) => r.counts);
  const seenCount = counted.filter((r) => seen.has(r.id)).length;
  const mark = (id: string, on: boolean) =>
    setSeen((s) => {
      const out = new Set(s);
      if (on) out.add(id);
      else out.delete(id);
      return out;
    });
  const toggle = (id: string) => {
    setOpen((o) => (o === id ? null : id));
    mark(id, true);
  };

  return (
    <div className="admin-rb-work">
      <section className="admin-card admin-rb-receipts" aria-label="Receipts">
        <div className="admin-rb-receipts-head">
          <h2 className="admin-card-title">Receipts</h2>
          <span className="admin-hint">
            {decision?.requireSeen ? `${seenCount} of ${counted.length} looked at · ` : ""}
            {summary}
          </span>
        </div>
        {rows.length === 0 && <div className="admin-empty">No receipts.</div>}
        {rows.map((r) => {
          const isOpen = open === r.id;
          const isSeen = seen.has(r.id);
          return (
            <div key={r.id} className={`admin-rb-row${isOpen ? " is-open" : ""}`}>
              <div className="admin-rb-row-main">
                {decision?.requireSeen && r.counts ? (
                  <button
                    type="button"
                    className={`admin-rb-seen${isSeen ? " is-on" : ""}`}
                    aria-pressed={isSeen}
                    aria-label={`${isSeen ? "Looked at" : "Mark as looked at"}: ${r.title}`}
                    onClick={() => mark(r.id, !isSeen)}
                  >
                    {isSeen ? "✓" : ""}
                  </button>
                ) : (
                  <span className="admin-rb-seen-gap" aria-hidden="true" />
                )}
                <span className="admin-rb-row-what">
                  <span className={`admin-rb-row-title${r.struck ? " is-struck" : ""}`}>{r.title}</span>
                  <span className="admin-list-sub">{r.sub}</span>
                </span>
                <span className={`admin-rb-row-value${r.struck ? " is-struck" : ""}`}>{r.value}</span>
                {/* The cell stays when there is no chip, so the row's columns line up. */}
                <span className="admin-rb-row-chip">{r.chip.label && <Badge tone={r.chip.tone}>{r.chip.label}</Badge>}</span>
                <button type="button" className="admin-btn admin-btn--sm admin-rb-row-open" aria-expanded={isOpen} onClick={() => toggle(r.id)}>
                  {isOpen ? "Close" : "Review"}
                </button>
              </div>
              {/* Always in the page, hidden until opened: it reads without JavaScript, and the page's tests see it. */}
              <div className="admin-rb-row-detail" hidden={!isOpen}>
                {r.detail}
              </div>
            </div>
          );
        })}
      </section>
      <aside className="admin-rb-aside" aria-label="Decision">
        {decided ? (
          <section className="admin-card admin-section-card u-stack u-gap-2" role="status">
            <strong className="admin-rb-done">✓ {decided.title}</strong>
            <span className="admin-hint">{decided.body}</span>
            <Link href={next.href} className="admin-btn admin-btn--primary admin-rb-primary">
              {next.label}
            </Link>
          </section>
        ) : (
          decision && (
            <section className="admin-card admin-section-card u-stack u-gap-3">
              <h2 className="admin-card-title">{decision.kind === "check" ? "Your check" : "Your approval"}</h2>
              <ReviewDecision {...decision} seen={decision.requireSeen ? { count: seenCount, total: counted.length } : null} onDone={setDecided} />
            </section>
          )
        )}
        {aside}
      </aside>
    </div>
  );
}
