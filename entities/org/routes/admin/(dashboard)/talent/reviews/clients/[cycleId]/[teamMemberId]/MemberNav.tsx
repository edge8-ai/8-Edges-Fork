import Link from "next/link";
import type { MemberNeighbours } from "@/entities/org/lib/client-reviews/member-page";

// The row above a member's page: a real button back to the cycle, and the
// previous and next member in the order the overview lists them (CR.5.8). The
// neighbours are worked out by the loader; this only draws them. It is hidden
// on paper, where the printed sheet is the only thing that prints.

const cyclePath = (cycleId: string) => `/admin/talent/reviews/clients/${cycleId}`;

export function MemberNav({
  cycleId,
  cycleLabel,
  neighbours,
}: {
  cycleId: string;
  /** "<client> · <cycle name>", or the cycle's name alone, or null when it could not be read. */
  cycleLabel: string | null;
  neighbours: MemberNeighbours | null;
}) {
  const { previous, next } = neighbours ?? { previous: null, next: null };
  return (
    <nav className="u-row u-between u-gap-3 u-wrap u-mb-3" aria-label="This cycle's members">
      <Link className="admin-btn admin-btn--sm" href={cyclePath(cycleId)}>
        ← Back to {cycleLabel ?? "the cycle"}
      </Link>
      {neighbours && (
        <div className="u-row u-gap-2 u-wrap">
          {previous && (
            <Link className="admin-btn admin-btn--sm" href={`${cyclePath(cycleId)}/${previous.teamMemberId}`} aria-label={`Previous member, ${previous.name}`}>
              ‹ {previous.name}
            </Link>
          )}
          <span className="admin-hint">
            {neighbours.position} of {neighbours.total}
          </span>
          {next && (
            <Link className="admin-btn admin-btn--sm" href={`${cyclePath(cycleId)}/${next.teamMemberId}`} aria-label={`Next member, ${next.name}`}>
              {next.name} ›
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
