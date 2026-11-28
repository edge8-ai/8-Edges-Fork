import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { saigonToday, shortDay } from "@/kernel/config/dates";
import { mayProp, type MayProp } from "@/kernel/identity/may-prop";
import { teamMemberIdsOf } from "@/entities/org/lib/client-reviews/access";
import { clientLinksOf } from "@/entities/org/lib/client-reviews/client-links";
import { clientCycleOverview } from "@/entities/org/lib/client-reviews/overview";
import { clientContactsOf } from "@/entities/org/lib/client-reviews/proposal";
import { listCurrentTeamMembers } from "@/entities/org/lib/reviews/talent";
import { ClientLinksCard } from "./ClientLinksCard";
import { CycleActions } from "./CycleActions";
import { DueDateField } from "./DueDateField";
import { EmailMembersCard } from "./EmailMembersCard";
import { RowActions } from "./RowActions";
import { hasMenuActions } from "./row-menu";
import { STAGE, STAGES } from "./stages";

export const metadata = {
  title: "Client review",
  description: "One client review cycle: each member's stage, both averages, and the client managers' links.",
};


/**
 * The framework's two forms, opened in the form builder (CR.6). The builder
 * hides review forms from its own list, so this is the way in. Its lock
 * (../forms-in-use) still holds while a cycle on the framework is open:
 * wording only. The builder's permission decides whether the links show.
 */
function CycleForms({
  may,
  closed,
  frameworkName,
  forms,
}: {
  may: MayProp;
  closed: boolean;
  frameworkName: string | null;
  forms: { memberSurveyId: string | null; raterSurveyId: string | null };
}) {
  if (!may["org.operations"] || (!forms.memberSurveyId && !forms.raterSurveyId)) return null;
  const framework = frameworkName ? `the ${frameworkName} framework` : "this cycle's framework";
  return (
    <div className="u-mt-4">
      <span className="admin-label">The forms</span>
      <div className="u-row u-gap-2 u-wrap">
        {forms.memberSurveyId && (
          <Link className="admin-btn admin-btn--sm" href={`/admin/operations/surveys/${forms.memberSurveyId}`}>
            Edit the member&apos;s form
          </Link>
        )}
        {forms.raterSurveyId && (
          <Link className="admin-btn admin-btn--sm" href={`/admin/operations/surveys/${forms.raterSurveyId}`}>
            Edit the client manager&apos;s form
          </Link>
        )}
      </div>
      <p className="admin-hint u-mt-2 u-mb-0">
        Both belong to {framework}, so a change reaches every cycle that uses it.
        {closed ? "" : " While this cycle is open you can reword any question; adding, removing or moving a question waits until it closes."}
      </p>
    </div>
  );
}

/** An average to two decimals, or a dash until that part is sent with every rating. */
const average = (n: number | null) => (n === null ? <span className="admin-cell-muted">—</span> : n.toFixed(2));

// /admin/talent/reviews/clients/[cycleId]: the overview that replaces the
// owner's sheet (CR.2.3, story 10). Copying a link sends nothing: the owner
// pastes each client manager's one link (CR.5.7) from their own email, because
// the app never contacts a client contact (story 19).
export default async function ClientCyclePage(props: { params: Promise<{ cycleId: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("org.reviews");
  // org.operations opens the form builder, so the forms' links show only with it (CR.6).
  const may = mayProp(access, ["org.reviews", "org.operations"]);
  const { cycleId } = await props.params;
  // Every team-member row of the viewer, so the overview can ask the rules
  // what their own row shows (whatOwnerSees): a review admin in the cycle
  // never holds the link that rates them, nor the skip-manager's link. A
  // must-read: a failed read is an error, never "not in the cycle".
  const own = await teamMemberIdsOf(access.personId);
  const origin = await getSiteOrigin();
  const overview = await clientCycleOverview(cycleId, origin, own);
  if (!overview) notFound();
  // Each client manager's one link, read after the overview so an unknown cycle is a 404 first.
  const links = await clientLinksOf(overview, origin, own);
  const { cycle, rows } = overview;
  const counts = STAGES.map((s) => ({ ...s, n: rows.filter((r) => r.stage === s.stage).length })).filter((s) => s.n > 0);
  const closed = cycle.closedAt !== null;

  // Who the owner's actions can name (CR.2.4): the client's contacts as client
  // managers, read through the Contacts door, and the team members not yet in
  // the cycle. Archived contacts are left out of the pickers.
  const [contacts, team] = await Promise.all([overview.companyId ? clientContactsOf(overview.companyId) : Promise.resolve([]), listCurrentTeamMembers()]);
  const inCycle = new Set(rows.map((r) => r.teamMemberId));
  const candidates = team.filter((m) => !inCycle.has(m.id));
  const stillIn = rows.filter((r) => r.stage !== "withdrawn");

  return (
    <div className="ats">
      <PageHead
        eyebrow={<Link href="/admin/talent/reviews/clients">Talent · Client reviews</Link>}
        title={cycle.clientName ? `${cycle.clientName} · ${cycle.name}` : cycle.name}
        sub={[cycle.frameworkName, `${cycle.members} ${cycle.members === 1 ? "member" : "members"}`, closed ? `closed ${formatDate(cycle.closedAt)}` : `opened ${formatDate(cycle.openedAt)}`]
          .filter(Boolean)
          .join(" · ")}
        // The cycle as a spreadsheet (CR.3.4): a plain link to a route that
        // checks the reviews permission again before it builds the file.
        action={
          <a className="admin-btn admin-btn--sm" href={`/admin/talent/reviews/clients/${cycle.id}/export`} download>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" />
            </svg>
            Download spreadsheet
          </a>
        }
      />

      <div className="admin-card u-mb-4 u-p-4">
        <div className="u-row u-gap-2 u-wrap">
          <span className="admin-label u-m-0">Where it stands</span>
          {counts.map((s) => (
            <Badge key={s.stage} tone={s.tone}>
              {s.label} {s.n}
            </Badge>
          ))}
        </div>
        {!overview.skipManagerName && (
          <p className="admin-hint u-mt-3 u-mb-0">This cycle has no skip-manager, so a review is ready to release once its client manager has sent their part.</p>
        )}
        <DueDateField
          may={may}
          cycleId={cycle.id}
          closed={closed}
          dueDate={overview.dueDate}
          dueLabel={overview.dueDate ? shortDay(overview.dueDate) : null}
          today={saigonToday()}
        />
        {!closed && !overview.clientHasTimeZone && overview.companyId && (
          <p className="admin-hint u-mt-1 u-mb-0">
            {cycle.clientName ?? "This client"} has no time zone set, so the due day ends at midnight in Saigon.{" "}
            <Link href={`/admin/revenue/companies/${overview.companyId}`}>Set it on the company page</Link>.
          </p>
        )}
        <CycleForms may={may} closed={closed} frameworkName={cycle.frameworkName} forms={overview.forms} />
      </div>

      {/* The two jobs after opening, side by side: email the members, and send the client their links. */}
      <div className="cr-cards">
        <EmailMembersCard may={may} cycleId={cycle.id} closed={closed} view={overview.memberEmail} />
        <ClientLinksCard
          may={may}
          cycleId={cycle.id}
          closed={closed}
          links={links}
          skip={{ link: overview.skipLink, copiedAt: overview.skipLinkCopiedAt, cancelled: overview.skipLinkCancelled, inCycle: overview.viewerInCycle }}
        />
      </div>

      <CycleActions
        may={may}
        cycleId={cycle.id}
        closed={closed}
        candidates={candidates}
        contacts={contacts}
        unreleased={stillIn.filter((r) => !r.released).length}
        membersWaiting={stillIn.filter((r) => !r.released && !r.memberSent).length}
        clientManagersWaiting={stillIn.filter((r) => r.clientManagerPartId && !r.clientManagerSent).length}
      />

      <div className="admin-card u-p-4">
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--phone">
            <thead>
              <tr>
                <th>Member</th>
                <th>Client manager</th>
                <th>Their part</th>
                <th>Client manager&apos;s part</th>
                <th>Stage</th>
                <th className="u-right">Self avg</th>
                <th className="u-right">Client avg</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stage = STAGE.get(r.stage);
                // A reopened part says so in its own column; only the unlock has nowhere else to show.
                const notes = r.unlocked ? ["Client manager's part unlocked"] : [];
                return (
                  <tr key={r.teamMemberId}>
                    <td className="admin-cell-strong admin-cell-phone-title">
                      {/* The member's page (CR.3.3): both parts, the summary and the release. Not one's own: `own` is the rules' answer (whatOwnerSees), which the page itself refuses on too. */}
                      {r.own ? r.name : <Link href={`/admin/talent/reviews/clients/${cycle.id}/${r.teamMemberId}`}>{r.name}</Link>}
                      {notes.map((n) => (
                        <div key={n} className="admin-hint u-m-0">
                          {n}
                        </div>
                      ))}
                    </td>
                    <td data-label="Client manager">{r.clientManagerName ?? <span className="admin-cell-muted">None</span>}</td>
                    <td data-label="Their part">{r.memberSent ? r.memberPart : <span className="admin-cell-muted">{r.memberPart}</span>}</td>
                    <td data-label="Client manager's part">
                      {r.clientManagerSent ? r.clientManagerPart : <span className="admin-cell-muted">{r.clientManagerPart}</span>}
                    </td>
                    <td data-label="Stage">
                      <Badge tone={stage?.tone ?? "neutral"}>{stage?.label ?? r.stage}</Badge>
                    </td>
                    <td className="u-right u-tabular" data-label="Self avg">{average(r.selfAverage)}</td>
                    <td className="u-right u-tabular" data-label="Client avg">{average(r.clientManagerAverage)}</td>
                    <td>
                      {/* Only the actions the rules allow on this row; none on a closed cycle, a withdrawn member, or the viewer's own review. */}
                      {hasMenuActions(r.actions, contacts.length) && (
                        <RowActions
                          may={may}
                          contacts={contacts}
                          // Only what the menu reads crosses to the browser.
                          row={{
                            cycleId: cycle.id,
                            teamMemberId: r.teamMemberId,
                            name: r.name,
                            clientManagerPersonId: r.clientManagerPersonId,
                            clientManagerName: r.clientManagerName,
                            clientManagerPartId: r.clientManagerPartId,
                            actions: r.actions,
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="admin-hint u-mt-3">
        Averages are of the framework&apos;s competency ratings, to two decimals, once that part is sent with every rating. The
        self average is never shown to the client manager. The spreadsheet has one row per member: the stage, both averages, and every
        answer from both parts, each in its own column. It never holds the skip-manager&apos;s notes. Only people who run reviews can
        download it.
      </p>
    </div>
  );
}
