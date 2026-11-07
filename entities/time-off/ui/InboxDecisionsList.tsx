"use client";

// The Decisions section of the team Inbox (TH.11): one row per decision that
// waits on the person. Each row says what it is and how far it reaches (in
// plain words, not tiers), who asked, and whose decision it is; leave is
// decided in its row with Approve and Decline, everything else opens where it
// is decided, and Details shows the facts the approval carries.
//
// A row decided here leaves at once and the page refreshes, which also
// redraws the sidebar's count.
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Result } from "@/kernel/data/result";

export type DecisionEntry = {
  id: string;
  subjectId: string;
  subject: string;
  reach: string;
  reachWarn: boolean;
  title: string;
  askedBy: string;
  asked: string;
  whose: string;
  inline: boolean;
  href: string | null;
  cta: string;
  facts: { label: string; value: string }[];
};

type Decision = "approved" | "rejected";

function DecisionRow({
  entry,
  open,
  pending,
  onToggle,
  onDecide,
}: {
  entry: DecisionEntry;
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  onDecide: (decision: Decision) => void;
}) {
  const factsId = useId();
  return (
    <article className="ti-dec">
      <div className="ti-dec-top">
        <div className="ti-dec-main">
          <p className="ti-dec-eyebrow">
            <span className="ti-dec-subject">{entry.subject}</span>
            <span className={entry.reachWarn ? "ti-reach ti-reach-warn" : "ti-reach"}>{entry.reach}</span>
          </p>
          <p className="ti-dec-title">{entry.title}</p>
          <p className="ti-meta">
            {entry.askedBy} · asked {entry.asked} · <b className="ti-whose">{entry.whose}</b>
          </p>
        </div>
        <div className="ti-acts ti-dec-acts">
          {entry.inline && (
            <>
              <button type="button" className="ti-btn" disabled={pending} onClick={() => onDecide("approved")}>
                Approve
              </button>
              <button type="button" className="ti-btn ti-btn-ghost" disabled={pending} onClick={() => onDecide("rejected")}>
                Decline
              </button>
            </>
          )}
          {!entry.inline && entry.href && (
            <Link className="ti-btn" href={entry.href}>
              {entry.cta}
            </Link>
          )}
          {entry.facts.length > 0 && (
            <button type="button" className="ti-btn ti-btn-ghost" aria-expanded={open} aria-controls={factsId} onClick={onToggle}>
              {open ? "Less" : "Details"}
            </button>
          )}
        </div>
      </div>
      {open && (
        <dl id={factsId} className="ti-facts">
          {entry.facts.map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

export function InboxDecisionsList({ entries, decide }: { entries: DecisionEntry[]; decide: (id: string, decision: Decision) => Promise<Result> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [decided, setDecided] = useState<string[]>([]);
  const shown = entries.filter((e) => !decided.includes(e.id));

  const act = (entry: DecisionEntry, decision: Decision) =>
    start(async () => {
      const r = await decide(entry.subjectId, decision);
      setError(r.ok ? null : r.error);
      if (r.ok) setDecided((d) => [...d, entry.id]);
      router.refresh();
    });

  return (
    <section className="ti-card ti-sec" aria-labelledby="ti-dec-h">
      <div className="ti-sec-head">
        <div>
          <p className="ti-k">Waiting on your decision</p>
          <h2 className="ti-h" id="ti-dec-h">
            Decisions
          </h2>
        </div>
        <span className={shown.length ? "ti-pill" : "ti-pill ti-pill-calm"}>{shown.length ? `${shown.length} to decide` : "Nothing to decide"}</span>
      </div>
      {error && <div className="admin-alert admin-alert--err">{error}</div>}
      {shown.length === 0 ? (
        <p className="ti-empty-p ti-dec-empty">No decisions are waiting on you. Leave requests, claims to check, drafts to publish and agreements to sign land here.</p>
      ) : (
        shown.map((entry) => (
          <DecisionRow
            key={entry.id}
            entry={entry}
            open={open === entry.id}
            pending={pending}
            onToggle={() => setOpen((o) => (o === entry.id ? null : entry.id))}
            onDecide={(decision) => act(entry, decision)}
          />
        ))
      )}
    </section>
  );
}
