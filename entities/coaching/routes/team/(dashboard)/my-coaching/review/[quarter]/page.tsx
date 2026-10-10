import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { formatDate } from "@/kernel/ui/format";
import { coachingMarkdownToHtml } from "@/entities/coaching/lib/markdown";
import { getQuarterReview } from "@/entities/coaching/lib/data/quarter-review";
import { QUARTER_PATTERN } from "@/entities/coaching/lib/quarter-review";
import { QuarterCard } from "@/entities/coaching/ui/QuarterCard";

export const metadata = {
  title: "Quarter in review",
  description: "One quarter of your coaching: the goal, the 1-1s, what you kept and what you noticed.",
};

// /team/my-coaching/review/<quarter> — the quarter in review (K.26). A private
// page for the member and, with ?profile=<id>, for their coach: getQuarterReview
// proves the relationship and answers null for anyone else, which is notFound
// here rather than a message that would confirm the profile exists.
//
// A page designed to be worth keeping (K.30.5): one display-size heading, the
// goal and how it ended, a small chart of kept out of made, then the lines the
// member wrote and the recaps they were sent. It is a server component with no
// interactivity at all, so it prints as it reads.

// The chart's geometry. Small enough to sit inside a card, large enough that a
// pale bar is still visible; laid out here because plain SVG in a server
// component is the whole chart — no client bundle for eight rectangles.
const BAR_WIDTH = 18;
const BAR_GAP = 10;
const CHART_HEIGHT = 72;

export default async function QuarterReviewPage(
  props: {
    params: Promise<{ quarter: string }>;
    searchParams?: Promise<{ profile?: string }>;
  }
) {
  // The page's declared permission (ADR 0013).
  await requirePermission("coaching.mine");
  const searchParams = await props.searchParams;
  const params = await props.params;
  const quarter = decodeURIComponent(params.quarter);
  if (!QUARTER_PATTERN.test(quarter)) notFound();

  const actor = await requireTeamMember();
  const page = await getQuarterReview(actor, quarter, searchParams?.profile);
  if (!page) notFound();
  const { review, memberName, letter } = page;

  const goalHtml = await Promise.all(
    review.goals.map((g) => (g.descriptionMarkdown ? coachingMarkdownToHtml(g.descriptionMarkdown) : Promise.resolve(null))),
  );

  const chartWidth = Math.max(1, review.bars.length) * (BAR_WIDTH + BAR_GAP) - BAR_GAP;

  return (
    <div className="admin-coach-profile">
      <div className="admin-hint">
        <Link href="/team/my-coaching?tab=history" className="admin-link-btn">
          ← Back to my coaching
        </Link>
      </div>

      <section className="admin-card admin-coach-section">
        <span className="admin-eyebrow">{memberName ? `${memberName} · quarter in review` : "Quarter in review"}</span>
        <div className="coach-display">
          <span className="coach-display-number">{review.heading}</span>
          <span className="coach-display-of">
            {formatDate(review.from)} to {formatDate(review.to)}
          </span>
        </div>
        {review.empty ? (
          <div className="admin-empty">Nothing was recorded in this quarter.</div>
        ) : (
          <div className="admin-hint">
            {review.meetings.length} 1-1{review.meetings.length === 1 ? "" : "s"} held, {review.kept} of {review.made}{" "}
            commitments kept.
          </div>
        )}
      </section>

      {/* The quarter on one card (L.11): the part somebody would actually show
          another person, laid out to survive a screenshot. */}
      {!review.empty && <QuarterCard review={review} memberName={memberName} />}

      {/* The letter, above the figures (L.10). The quarter reads as a story that
          had an intention, and the numbers are the epilogue — which is the
          whole reason it was sealed for three months. */}
      {letter && (
        <section className="admin-card admin-coach-section coach-letter-open-card">
          <div className="admin-eyebrow admin-eyebrow--growth">
            Sealed {letter.sealedOn ? formatDate(letter.sealedOn) : "when you set the goal"} · opened today
          </div>
          <div className="admin-card-title">What you wrote to yourself</div>
          <p className="coach-letter-body">{letter.body}</p>
        </section>
      )}

      {review.goals.length > 0 && (
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">The goal</div>
          {review.goals.map((g, i) => (
            <div key={g.title} className="coach-quarter-goal">
              <p>
                <strong>{g.title}</strong>
              </p>
              <p className="admin-cell-muted">{g.ending}</p>
              {goalHtml[i] && <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: goalHtml[i] ?? "" }} />}
            </div>
          ))}
        </section>
      )}

      {review.bars.length > 0 && (
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">Kept, meeting by meeting</div>
          <div className="admin-hint">
            One bar per 1-1 in this quarter, oldest first: how much of what that meeting committed to was kept.
          </div>
          <svg
            className="coach-quarter-chart"
            viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
            width={chartWidth}
            height={CHART_HEIGHT}
            role="img"
            aria-label={`Kept out of made, ${review.bars
              .map((b) => `${formatDate(b.heldOn)}: ${b.kept} of ${b.made}`)
              .join("; ")}`}
          >
            {review.bars.map((b, i) => {
              const x = i * (BAR_WIDTH + BAR_GAP);
              const height = Math.max(2, Math.round(b.ratio * CHART_HEIGHT));
              return (
                <g key={b.id}>
                  <rect
                    className="coach-quarter-bar-track"
                    x={x}
                    y={0}
                    width={BAR_WIDTH}
                    height={CHART_HEIGHT}
                    rx={4}
                  />
                  <rect
                    className="coach-quarter-bar"
                    x={x}
                    y={CHART_HEIGHT - height}
                    width={BAR_WIDTH}
                    height={height}
                    rx={4}
                  >
                    <title>{`${formatDate(b.heldOn)}: ${b.kept} of ${b.made} kept`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        </section>
      )}

      {review.meetings.length > 0 && (
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">The 1-1s</div>
          {review.meetings.map((m) => (
            <p key={m.id} className="coach-quarter-line">
              <strong>{formatDate(m.heldOn)}</strong>{" "}
              <span className="admin-cell-muted">{m.recapLine || "No recap shared."}</span>{" "}
              <span className="admin-badge">{`${m.kept}/${m.made} kept`}</span>
            </p>
          ))}
        </section>
      )}

      {review.notes.length > 0 && (
        <section className="admin-card admin-coach-section">
          <div className="admin-card-title">Worth remembering</div>
          {review.notes.map((n) => (
            <p key={`${n.on}-${n.body}`} className="coach-quarter-line">
              <strong>{formatDate(n.on)}</strong> <span className="admin-cell-muted">{n.body}</span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
