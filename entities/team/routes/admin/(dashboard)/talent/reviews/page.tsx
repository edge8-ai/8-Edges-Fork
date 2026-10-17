import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { saigonToday } from "@/kernel/config/dates";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import {
  listTalentReviewCycles,
  listCurrentTeamMembers,
  REVIEW_TYPE_LABEL,
  DECISION_LABEL,
  RATER_LABEL,
  REVIEW_DIMENSIONS,
  type TalentReviewCycle,
} from "@/entities/team";
import { addReviewerAction, sendReviewLinkAction } from "./actions";

export const metadata = {
  title: "Reviews",
  description: "Every probation and performance review cycle, who has submitted, and who still owes one.",
};

function statusBadge(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "open":
    case "draft":
      return { label: "Waiting", tone: "warn" };
    case "submitted":
      return { label: "Submitted", tone: "info" };
    case "finalized":
    case "acknowledged":
      return { label: "Finalized", tone: "ok" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function AddReviewerForm({
  teamMemberId,
  members,
}: {
  teamMemberId: string;
  members: Array<{ id: string; name: string }>;
}) {
  return (
    <form action={addReviewerAction} className="admin-form u-mt-3">
      <input type="hidden" name="team_member_id" value={teamMemberId} />
      <div className="admin-form-row">
        <label className="admin-field">
          <span className="admin-label">Team member</span>
          <select name="reviewer_team_member_id" className="admin-input" defaultValue="">
            <option value="">Someone outside the team</option>
            {members
              .filter((m) => m.id !== teamMemberId)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <label className="admin-field">
          <span className="admin-label">Name</span>
          <input name="reviewer_name" className="admin-input" placeholder="For someone outside the team" />
        </label>
        <label className="admin-field">
          <span className="admin-label">Email</span>
          <input name="reviewer_email" type="email" className="admin-input" placeholder="their@email.com" />
        </label>
      </div>
      <div className="admin-form-actions">
        <button type="submit" className="admin-btn admin-btn--primary">
          Add reviewer
        </button>
        <span className="admin-hint u-m-0">
          Pick a team member, or leave that blank and give a name and email. The link comes back right here.
        </span>
      </div>
    </form>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="u-mt-2">
      <div className="u-strong">{label}</div>
      <p className="u-m-0 u-mt-1 u-prewrap">{value}</p>
    </div>
  );
}

// Every submitted review on the cycle: ratings side by side, then each
// rater's written answers. Open rows are listed above with their links.
function CycleResults({ cycle }: { cycle: TalentReviewCycle }) {
  const submitted = cycle.raters.filter((r) => r.status !== "open" && r.status !== "draft");
  if (submitted.length === 0) return <p className="admin-hint u-mt-3">Nothing submitted yet.</p>;
  return (
    <div className="u-mt-4">
      <div className="admin-card-title">Results</div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Dimension</th>
              {submitted.map((r) => (
                <th key={r.reviewId}>
                  {r.name}
                  <span className="admin-cell-muted"> · {RATER_LABEL[r.raterKind] ?? r.raterKind}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REVIEW_DIMENSIONS.map((d) => {
              if (submitted.every((r) => r.ratings[d.key] === undefined)) return null;
              return (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  {submitted.map((r) => (
                    <td key={r.reviewId}>{r.ratings[d.key] ?? ""}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {submitted.map((r) => (
        <div key={r.reviewId} className="u-mt-3">
          <div className="u-strong">
            {r.name} <span className="admin-cell-muted">({RATER_LABEL[r.raterKind] ?? r.raterKind})</span>
          </div>
          <TextBlock label="Achievements" value={r.achievements} />
          <TextBlock label="Areas for Improvement" value={r.improvements} />
          <TextBlock label="Additional comments" value={r.comments} />
          {!r.achievements && !r.improvements && !r.comments && (
            <p className="admin-hint u-m-0">Ratings only, no written answers.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function CycleRow({
  cycle,
  open,
  members,
}: {
  cycle: TalentReviewCycle;
  open: boolean;
  members: Array<{ id: string; name: string }>;
}) {
  const key = `${cycle.teamMemberId}::${cycle.cycleLabel}`;
  const submitted = cycle.raters.filter((r) => r.status !== "open" && r.status !== "draft").length;
  return (
    <details className="admin-card u-mb-3 u-p-4" open={open}>
      <summary className="u-row u-gap-3 u-wrap u-pointer">
        <span className="admin-cell-strong">
          <Link href={`/admin/talent/team/${cycle.teamMemberId}`}>{cycle.subjectName}</Link>
        </span>
        <span>{REVIEW_TYPE_LABEL[cycle.reviewType] ?? "Review"}</span>
        <span className="admin-cell-muted">opened {formatDate(cycle.openedAt)}</span>
        {cycle.probationEndsOn && (
          <span className="admin-cell-muted">probation ends {formatDate(cycle.probationEndsOn)}</span>
        )}
        <span className="admin-cell-muted">
          {submitted}/{cycle.raters.length} submitted
        </span>
        {cycle.atRisk ? (
          <Badge tone="err">No finalized review</Badge>
        ) : (
          <Badge tone={statusBadge(cycle.managerStatus ?? "open").tone}>{statusBadge(cycle.managerStatus ?? "open").label}</Badge>
        )}
        {cycle.decision && <Badge tone="neutral">{DECISION_LABEL[cycle.decision] ?? cycle.decision}</Badge>}
      </summary>
      <div className="u-mt-3">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Reviewer</th>
                <th>Role</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Link</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cycle.raters.map((r) => {
                const badge = statusBadge(r.status);
                const fillable = r.status === "open" || r.status === "draft" || r.status === "submitted";
                return (
                  <tr key={r.reviewId}>
                    <td className="admin-cell-strong">{r.name}</td>
                    <td>{RATER_LABEL[r.raterKind] ?? r.raterKind}</td>
                    <td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td>{r.submittedAt ? formatDate(r.submittedAt) : <span className="admin-cell-muted">—</span>}</td>
                    <td>
                      {r.raterKind === "self" ? (
                        <span className="admin-cell-muted">their portal</span>
                      ) : (
                        <input className="admin-input" readOnly value={r.link} size={48} />
                      )}
                    </td>
                    <td>
                      {r.raterKind !== "self" && fillable && r.email && (
                        <form action={sendReviewLinkAction}>
                          <input type="hidden" name="review_id" value={r.reviewId} />
                          <input type="hidden" name="cycle_key" value={key} />
                          <button type="submit" className="admin-btn admin-btn--sm">
                            {r.linkSentAt ? `Resend (sent ${formatDate(r.linkSentAt)})` : "Email link"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {cycle.managerStatus !== "finalized" && cycle.managerStatus !== "acknowledged" && (
          <AddReviewerForm teamMemberId={cycle.teamMemberId} members={members} />
        )}
        <CycleResults cycle={cycle} />
      </div>
    </details>
  );
}

// /admin/talent/reviews: every review cycle, probation and performance, with
// each rater's status and a way to add reviewers beyond the manager and hand
// them a link. Writes go through the team entity's review-requests module.
export default async function TalentReviewsPage(
  props: {
    searchParams?: Promise<{ open?: string; subject?: string; notice?: string }>;
  }
) {
  // The page's declared permission (ADR 0013).
  await requirePermission("team.reviews");
  const searchParams = await props.searchParams;
  const [cycles, members] = await Promise.all([listTalentReviewCycles(saigonToday()), listCurrentTeamMembers()]);
  // ?open= names one cycle; ?subject=<team_members.id> (from the probation
  // list) opens that person's newest cycle instead.
  const subjectCycle = searchParams?.subject ? cycles.find((c) => c.teamMemberId === searchParams.subject) : null;
  const openKey = searchParams?.open ?? (subjectCycle ? `${subjectCycle.teamMemberId}::${subjectCycle.cycleLabel}` : null);
  const atRisk = cycles.filter((c) => c.atRisk).length;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/talent">← Talent</Link>}
        title="Reviews"
        sub={`${cycles.length} cycle${cycles.length === 1 ? "" : "s"}${atRisk ? ` · ${atRisk} probation${atRisk === 1 ? "" : "s"} without a finalized review` : ""}`}
      />

      {searchParams?.notice && (
        <div className="admin-card u-p-3 u-mb-4">
          <span className="u-sm">{searchParams.notice}</span>
        </div>
      )}

      <div className="admin-card u-mb-4 u-p-4">
        <div className="admin-card-title">Start a review, or add a reviewer</div>
        <p className="admin-hint">
          Pick who is being reviewed. Their open cycle is used; if they have none, one is opened (probation for
          someone on probation, otherwise an ad-hoc review) with their self-assessment and manager review.
        </p>
        <form action={addReviewerAction} className="admin-form u-mt-3">
          <div className="admin-form-row">
            <label className="admin-field">
              <span className="admin-label">Being reviewed</span>
              <select name="team_member_id" className="admin-input" required defaultValue="">
                <option value="" disabled>
                  Choose a team member
                </option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">Team reviewer</span>
              <select name="reviewer_team_member_id" className="admin-input" defaultValue="">
                <option value="">Someone outside the team</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">Name</span>
              <input name="reviewer_name" className="admin-input" placeholder="For someone outside the team" />
            </label>
            <label className="admin-field">
              <span className="admin-label">Email</span>
              <input name="reviewer_email" type="email" className="admin-input" placeholder="their@email.com" />
            </label>
          </div>
          <div className="admin-form-actions">
            <button type="submit" className="admin-btn admin-btn--primary">
              Add reviewer
            </button>
          </div>
        </form>
      </div>

      {cycles.length === 0 ? (
        <div className="admin-empty">No review cycles yet.</div>
      ) : (
        cycles.map((c) => (
          <CycleRow key={`${c.teamMemberId}::${c.cycleLabel}`} cycle={c} open={openKey === `${c.teamMemberId}::${c.cycleLabel}`} members={members} />
        ))
      )}
    </>
  );
}
