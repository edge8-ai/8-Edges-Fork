import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { mayProp } from "@/kernel/identity/may-prop";
import { teamMemberIdsOf } from "@/entities/org/lib/client-reviews/access";
import { clientMemberPage } from "@/entities/org/lib/client-reviews/member-page";
import type { AnswerBeside } from "@/entities/org/lib/client-reviews/beside";
import { STAGE } from "../stages";
import { ReleasePanel } from "./ReleasePanel";
import { SummaryForm } from "./SummaryForm";
import { PrintButton } from "./PrintButton";
import { PrintSheet } from "./PrintSheet";
import { saigonToday } from "@/kernel/config/dates";

export const metadata = {
  title: "Client review",
  description: "One member's client review: both parts side by side, the skip-manager's notes, the HR summary and the release.",
};

// One member's client review for the person running the cycle (CR.3.3, story
// 53), as the CR.3.1 prototype drew it: both parts side by side with the
// skip-manager's notes beside the client manager's answers, both averages,
// the HR summary, and the release. The notes column is for review admins
// only; nothing on this page reaches the member until release.

/** An answer as one table cell: the rating or choice, then the words. */
function AnswerCell({ answer, differs }: { answer: AnswerBeside | null; differs?: boolean }) {
  if (!answer) return <span className="admin-cell-muted">Not answered</span>;
  const head = answer.rating !== null ? (answer.ratingLabel ? `${answer.rating} · ${answer.ratingLabel}` : String(answer.rating)) : answer.choice;
  return (
    <div className="u-stack u-gap-1">
      {head && <Badge tone={differs ? "info" : "neutral"}>{head}</Badge>}
      {answer.text && <span className="u-prewrap">{answer.text}</span>}
    </div>
  );
}

const average = (n: number | null) => (n === null ? "—" : n.toFixed(2));

export default async function ClientMemberReviewPage(props: { params: Promise<{ cycleId: string; teamMemberId: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("org.reviews");
  const may = mayProp(access, ["org.reviews"]);
  const { cycleId, teamMemberId } = await props.params;
  const page = await clientMemberPage(cycleId, teamMemberId, await teamMemberIdsOf(access.personId));
  if (!page) notFound();
  const back = <Link href={`/admin/talent/reviews/clients/${cycleId}`}>Talent · Client reviews</Link>;

  if (page.kind === "own") {
    return (
      <div className="ats">
        <PageHead eyebrow={back} title="Your own review" />
        <div className="admin-card u-p-4">
          <p className="u-m-0">A colleague reads and releases your review. Once it is released, you read it under Reviews in the team app.</p>
        </div>
      </div>
    );
  }

  const stage = STAGE.get(page.stage);
  const first = page.member.name;
  const cm = page.clientManagerName ?? "The client manager";
  return (
    <div className="ats">
      <PageHead
        eyebrow={back}
        title={page.member.name}
        sub={[
          page.cycle.clientName ? `${page.cycle.clientName} · ${page.cycle.name}` : page.cycle.name,
          page.clientManagerName ? `client manager ${page.clientManagerName}` : null,
          page.skipManagerName ? `skip-manager ${page.skipManagerName}` : null,
          page.member.managerName ? `manager of record ${page.member.managerName}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={<PrintButton />}
      />
      <PrintSheet page={page} printedOn={saigonToday()} />

      <div className="cr-open-grid">
        <div className="u-stack u-gap-4 u-min-0">
          <section className="admin-card u-p-4" aria-labelledby="cr-where">
            <div className="u-row u-between u-gap-3 u-wrap">
              <h2 id="cr-where" className="admin-card-title u-m-0">
                Where it is
              </h2>
              <Badge tone={stage?.tone ?? "neutral"}>{stage?.label ?? page.stage}</Badge>
            </div>
            <p className="admin-hint u-mt-2 u-mb-0">
              {[
                page.memberSentAt ? `${first} sent theirs ${formatDate(page.memberSentAt)}` : `${first} has not sent theirs`,
                page.clientManagerSentAt ? `${cm} sent theirs ${formatDate(page.clientManagerSentAt)}` : `${cm} has not sent theirs`,
                page.releasedAt ? `released ${formatDate(page.releasedAt)}` : null,
                page.cycle.closed ? "the cycle is closed, so its links no longer open" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="u-row u-gap-3 u-wrap u-mt-3">
              <div className="admin-card u-p-3 u-flex-1">
                <div className="admin-hint">{first}&apos;s own average</div>
                <div className="admin-page-title">{average(page.selfAverage)}</div>
              </div>
              <div className="admin-card u-p-3 u-flex-1">
                <div className="admin-hint">{cm}&apos;s average</div>
                <div className="admin-page-title">{average(page.clientManagerAverage)}</div>
              </div>
              {page.ratedDifferently !== null && (
                <div className="admin-card u-p-3 u-flex-1">
                  <div className="admin-hint">Rated differently</div>
                  <div className="admin-page-title">{page.ratedDifferently}</div>
                </div>
              )}
            </div>
          </section>

          <section className="admin-card u-p-4" aria-labelledby="cr-parts">
            <h2 id="cr-parts" className="admin-card-title">
              Both parts, side by side
            </h2>
            <div className="admin-table-wrap admin-table-wrap--flat">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>{first}</th>
                    <th>{cm}</th>
                    <th>{page.skipManagerName ?? "Skip-manager"}&apos;s notes · admins only</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => {
                    const differs = r.member?.rating != null && r.clientManager?.rating != null && r.member.rating !== r.clientManager.rating;
                    return (
                      <tr key={r.key}>
                        <td className="admin-cell-strong">{r.title}</td>
                        <td>
                          <AnswerCell answer={r.member} />
                        </td>
                        <td>
                          <AnswerCell answer={r.clientManager} differs={differs} />
                        </td>
                        <td>{r.note ? <span className="u-prewrap">{r.note}</span> : <span className="admin-cell-muted">No note</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="admin-hint u-mt-2 u-mb-0">
              Averages are of the framework&apos;s competency ratings, once a part is sent with every rating. The skip-manager&apos;s notes never
              reach {first}, their manager or the client manager, before or after release.
            </p>
          </section>
        </div>

        <aside className="u-stack u-gap-4" aria-label="Summary and release">
          <SummaryForm may={may} cycleId={cycleId} teamMemberId={teamMemberId} memberName={first} initial={page.summary} canEdit={page.actions.edit_summary} />
          <ReleasePanel
            may={may}
            cycleId={cycleId}
            teamMemberId={teamMemberId}
            memberName={first}
            managerName={page.member.managerName}
            clientManagerName={page.clientManagerName}
            skipManagerName={page.skipManagerName}
            clientManagerSentAt={page.clientManagerSentAt}
            skipMarkedAt={page.skipMarkedAt}
            skipWaivedAt={page.skipWaivedAt}
            releasedAt={page.releasedAt}
            hasSkipManager={page.cycle.hasSkipManager}
            canWaive={page.actions.waive_skip}
            canRelease={page.actions.release}
          />
        </aside>
      </div>
    </div>
  );
}
