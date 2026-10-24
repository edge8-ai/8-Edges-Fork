import Link from "next/link";
import type { ReviewCard as Card, ReviewHistory } from "@/entities/team/lib/reviews/home";

// One review on the Reviews page (TH.14): who it is about, the reader's part,
// the date that matters, and the path the review walks, with the reader's
// step marked. The path's labels carry the meaning; the dots only echo them.

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function Lock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ReviewCard({ card }: { card: Card }) {
  return (
    <article className="rv-item">
      <div className="rv-item-top">
        <span className="rv-av" aria-hidden="true">
          {card.initials}
        </span>
        <div className="u-min-0">
          <p className="rv-eyebrow">
            <span>{card.kind}</span>
            <span className="rv-part">{card.part}</span>
          </p>
          <h3 className="rv-who">{card.who}</h3>
          <p className={card.due.warn ? "rv-due-warn" : "rv-due"}>{card.due.text}</p>
        </div>
        <Link className="rv-btn" href={card.cta.href}>
          {card.cta.label}
        </Link>
      </div>
      <ol className="rv-steps" aria-label="Where this review is">
        {card.steps.map((s) => (
          <li key={s.label} className={`rv-step is-${s.state}`}>
            <span className="rv-dot" aria-hidden="true">
              {s.state === "done" && <Check />}
            </span>
            <span className="rv-step-l">
              {s.label}
              {s.state === "now" && <span className="u-sr-only"> (you are here)</span>}
              {s.state === "done" && <span className="u-sr-only"> (done)</span>}
            </span>
            {s.sub && <span className="rv-step-s">{s.sub}</span>}
          </li>
        ))}
      </ol>
      {card.note && (
        <p className="rv-note">
          <Lock />
          <span>{card.note}</span>
        </p>
      )}
    </article>
  );
}

export function ReviewHistoryList({ rows }: { rows: ReviewHistory[] }) {
  return (
    <ul className="rv-hist">
      {rows.map((h) => (
        <li key={h.id}>
          <span className="rv-hist-date">{h.date}</span>
          <div className="u-min-0">
            <p className="rv-hist-t">
              {h.title}
              {h.decision && <span className="rv-decision">{h.decision}</span>}
            </p>
            <p className="rv-hist-s">{h.sub}</p>
          </div>
          <Link className="rv-link" href={h.href}>
            Read
          </Link>
        </li>
      ))}
    </ul>
  );
}
