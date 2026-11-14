import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { describeDay } from "@/entities/coaching/lib/cadence";
import type { DottedRelationship, PastTeamRow } from "@/entities/coaching/lib/data/team-tabs";

// The coach page's three tabs (2026-10-08): Current is the roster as it was,
// Dotted Line and Past Team are below. Links rather than buttons, so each tab
// is a URL a coach can come back to.

export type TeamView = "current" | "dotted" | "past";

const TABS: { id: TeamView; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "dotted", label: "Dotted Line" },
  { id: "past", label: "Past Team" },
];

/** The tab a ?view= asks for; anything else opens Current. */
export function resolveTeamView(raw: string | undefined): TeamView {
  return TABS.find((t) => t.id === raw)?.id ?? "current";
}

export function TeamTabBar({ active, counts }: { active: TeamView; counts: Partial<Record<TeamView, number>> }) {
  return (
    <nav className="admin-tabs coach-tabs" aria-label="Your people">
      {TABS.map((t) => {
        const isActive = t.id === active;
        const count = counts[t.id];
        return (
          <Link
            key={t.id}
            href={t.id === "current" ? "/team/coaching" : `/team/coaching?view=${t.id}`}
            aria-current={isActive ? "page" : undefined}
            className={`admin-tab${isActive ? " is-active" : ""}`}
          >
            {t.label}
            {typeof count === "number" && count > 0 && <span className="admin-coach-tab-count">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function PastTeamPane({ rows }: { rows: PastTeamRow[] }) {
  if (rows.length === 0) return <p className="admin-empty coach-empty">Nobody you coached has moved on yet.</p>;
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Person</th>
          <th>Why</th>
          <th>Last 1-1</th>
          <th>1-1s held</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.profileId}>
            <td>
              <Link href={`/team/coaching/${r.profileId}`}>{r.member.name}</Link>
            </td>
            <td>{r.reason === "left" ? "Left Edge8" : "Coaching ended"}</td>
            <td>{r.lastHeldOn ? describeDay(r.lastHeldOn) : "Never met"}</td>
            <td className="admin-cell-mono">{r.heldCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const RELATIONSHIP_LABEL: Record<DottedRelationship, string> = {
  direct: "Direct report",
  skip: "Skip-level",
  dotted: "Dotted line",
};

export type DottedLinePaneRow = {
  profileId: string;
  name: string;
  relationship: DottedRelationship;
  coachName: string | null;
  // Recaps already rendered to sanitised HTML on the server (lib/markdown.ts).
  sessions: { id: string; heldOn: string; goalsCheck: boolean; html: string | null }[];
};

export function DottedLinePane({ rows }: { rows: DottedLinePaneRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="admin-empty coach-empty">
        Sessions you lead with people someone else coaches land here. Name the Lark recording &ldquo;1-1 Name &lt;&gt;
        You&rdquo; and the daily pickup files it.
      </p>
    );
  }
  return (
    <div className="coach-dotted">
      {rows.map((r) => (
        <section key={r.profileId} className="admin-section-card">
          <h2 className="coach-section-title">
            {r.name} <Badge tone={r.relationship === "skip" ? "info" : "neutral"}>{RELATIONSHIP_LABEL[r.relationship]}</Badge>
          </h2>
          {r.coachName && <p className="admin-cell-muted">Coached by {r.coachName}</p>}
          {r.sessions.map((s) => (
            <details key={s.id}>
              <summary>
                {describeDay(s.heldOn)}
                {s.goalsCheck ? " · goals check" : ""}
              </summary>
              {s.html ? (
                <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: s.html }} />
              ) : (
                <p className="admin-cell-muted">No recap yet. The transcript has not come through.</p>
              )}
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
