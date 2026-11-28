import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { reviewsWaitingFor, type ReviewsWaiting as Waiting } from "@/entities/org";

type ClientManagerRow = Waiting["clientManager"][number]["rows"][number];

// The portal home's "Reviews waiting on you" card (CR.3.6, as the prototype
// approved on 13 Nov drew it): for a client manager, the members of each open
// cycle they rate, a ready one linking to the same form as their link; for a
// skip-manager, each cycle they are skip-manager of, linking to the same page
// as their link. Hidden for every other contact. It reads its own rows, so the
// home's loaders stay bound to the company and this one to the person.
export async function ReviewsWaiting({ personId }: { personId: string }) {
  const waiting: Waiting = await reviewsWaitingFor([personId]);
  if (waiting.clientManager.length === 0 && waiting.skipManager.length === 0) return null;
  return (
    <>
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Reviews waiting on you</h2>
      </div>
      {waiting.clientManager.map((cycle) => (
        <div className="admin-card admin-section-card admin-card--attention u-mb-4" key={cycle.cycleId}>
          <p className="admin-hint u-mt-0">
            {cycle.cycleName} · you are the client manager for {cycle.rows.length} {cycle.rows.length === 1 ? "person" : "people"}
          </p>
          <div className="admin-list">
            {cycle.rows.map((r) =>
              r.href ? (
                <Link className="admin-list-row u-link-plain" key={r.reviewId} href={r.href}>
                  <RowText row={r} />
                  <div className="admin-list-aside"><Badge tone="warn">Rate</Badge></div>
                </Link>
              ) : (
                <div className="admin-list-row" key={r.reviewId}>
                  <RowText row={r} />
                  <div className="admin-list-aside">{r.state === "sent" ? <Badge tone="ok">Sent</Badge> : <Badge>Not yet</Badge>}</div>
                </div>
              ),
            )}
          </div>
          <p className="admin-hint u-mb-0">The same form as the links you were sent. Your answers are saved to the same review.</p>
        </div>
      ))}
      {waiting.skipManager.length > 0 && (
        <div className="admin-card admin-section-card admin-card--attention u-mb-4">
          <div className="admin-list">
            {waiting.skipManager.map((c) => (
              <Link className="admin-list-row u-link-plain" key={c.cycleId} href={c.href}>
                <div className="admin-list-main">
                  <div className="admin-list-title">{c.cycleName} · you are the skip-manager</div>
                  <div className="admin-list-sub">
                    {c.people} {c.people === 1 ? "person" : "people"} · {c.ready} ready for your notes · {c.reviewed} marked Reviewed
                  </div>
                </div>
                <div className="admin-list-aside"><Badge tone="warn">Open</Badge></div>
              </Link>
            ))}
          </div>
          <p className="admin-hint u-mb-0">
            Opens the same page as your link: both parts for each person once their client manager has sent theirs, your notes, and Reviewed.
          </p>
        </div>
      )}
    </>
  );
}

function RowText({ row }: { row: ClientManagerRow }) {
  const sub =
    row.state === "sent"
      ? row.sentAt
        ? `You sent yours on ${formatDate(row.sentAt)}.`
        : "You sent yours."
      : row.state === "waiting"
        ? "Waiting on their own part first."
        : row.memberSent
          ? "Their own part is sent. Yours is ready."
          : "Yours is open to fill now.";
  return (
    <div className="admin-list-main">
      <div className="admin-list-title">{row.name}</div>
      <div className="admin-list-sub">{sub}</div>
    </div>
  );
}
