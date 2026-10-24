import { requirePortalPermission } from "@/kernel/identity/access-request";
import {
  getAssignedLeaveDirectory,
  getAssignedLeavePolicies,
  getAssignedTimeOff,
  getLeaveDecisionQueue,
  isClientLeaveApprover,
  type PortalTimeOffEntry,
} from "@/entities/portal/lib/time-off";
import { DecisionQueue } from "./DecisionQueue";
import { ConfirmBalanceButton } from "./ConfirmBalanceButton";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone as memberStatusTone, type BadgeTone } from "@/kernel/ui/Badge";
import { type TabDef, Tabs } from "@/kernel/ui/Tabs";
import { ViewToggle } from "@/kernel/ui/ViewToggle";
import {
  type CalendarEntry,
  HowItWorks,
  LeaveShelf,
  PolicyCard,
  TimeOffCalendar,
  listHolidayDatesCovering,
} from "@/entities/time-off";
import { PreviewRow } from "@/kernel/ui/PreviewRow";
import { formatNumber, LEAVE_TYPE_LABEL, type LeaveType } from "@/entities/time-off";
import { formatDate, humanize } from "@/kernel/ui/format";
import { saigonToday } from "@/kernel/config/dates";

// Client-facing time off: who from the dedicated team is out, when. Read-only
// v1 — see docs/plans/2026-07-11-client-portal-design.md. Every field rendered
// here comes from entities/portal/lib/time-off.ts's hard-restricted column list; there
// is no reason, manager note, balance, or policy data to accidentally leak.
function statusLabel(status: string): { text: string; tone: BadgeTone } {
  switch (status) {
    case "approved":
      return { text: "Approved", tone: "ok" };
    case "taken":
      return { text: "Taken", tone: "ok" };
    case "requested":
      return { text: "Pending", tone: "warn" };
    default:
      return { text: status, tone: "neutral" };
  }
}

function leaveTypeLabel(type: string): string {
  return LEAVE_TYPE_LABEL[type as LeaveType] ?? type;
}

function dateRange(e: PortalTimeOffEntry): string {
  if (e.startDate === e.endDate) return formatDate(e.startDate) + (e.isHalfDay ? " (half day)" : "");
  return `${formatDate(e.startDate)} → ${formatDate(e.endDate)}`;
}

function EntryList({ entries }: { entries: PortalTimeOffEntry[] }) {
  return (
    <div className="admin-list">
      {entries.map((e) => {
        const s = statusLabel(e.status);
        return (
          <div className="admin-list-row" key={e.id}>
            <div className="admin-list-main">
              <div className="admin-list-title">{e.name}</div>
              <div className="admin-list-sub">{leaveTypeLabel(e.leaveType)} · {dateRange(e)}</div>
            </div>
            <div className="admin-list-aside">
              <Badge tone={s.tone}>{s.text}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function PortalTimeOffPage(props: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const searchParams = await props.searchParams;
  const actor = await requirePortalPermission("surface.portal");
  // isApprover is false for everyone not named as client manager on an active
  // placement, which is how the decision section, and the reasons in it, stay
  // invisible to the rest of the client team.
  const [entries, decisionQueue, isApprover, directory, policies] = await Promise.all([
    getAssignedTimeOff(actor),
    getLeaveDecisionQueue(actor),
    isClientLeaveApprover(actor),
    getAssignedLeaveDirectory(actor),
    getAssignedLeavePolicies(actor),
  ]);

  // "Today" is the Saigon calendar date: the team is in Vietnam, and the UTC
  // date the server sees is still yesterday until 07:00 GMT+7. A pending
  // request that covers today is out now too; it keeps its Pending badge, the
  // same way Upcoming shows one.
  const today = saigonToday();
  const outNow = entries.filter((e) => e.startDate <= today && e.endDate >= today);
  const upcoming = entries.filter((e) => e.startDate > today);
  const history = [...entries].sort((a, b) => b.startDate.localeCompare(a.startDate));

  // The office-closure calendar covering the leave shown here, so a shelf entry
  // is not counted for days the company was shut.
  const holidays = await listHolidayDatesCovering(entries.flatMap((e) => [e.startDate, e.endDate]));

  const calendarEntries: CalendarEntry[] = entries.map((e) => ({
    id: e.id,
    name: e.name,
    leaveType: e.leaveType,
    status: e.status,
    startDate: e.startDate,
    endDate: e.endDate,
    isHalfDay: e.isHalfDay,
  }));

  const muted = <span className="admin-cell-muted">—</span>;

  // What needs attention today: the decision queue (approvers only), who is out
  // and what is coming. Each card is a sibling so the section-card gap applies.
  const overview = (
    <>
      {isApprover && <DecisionQueue requests={decisionQueue} />}
      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Out now ({outNow.length})</h2>
        {outNow.length === 0 ? (
          <div className="admin-empty admin-empty--tall">No one is out right now.</div>
        ) : (
          <EntryList entries={outNow} />
        )}
      </div>
      <div className="admin-card admin-section-card">
        <h2 className="admin-card-title">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <div className="admin-empty admin-empty--tall">Nothing scheduled.</div>
        ) : (
          <EntryList entries={upcoming} />
        )}
      </div>
    </>
  );

  // Same table the admin History page shows, minus the profile links, scoped
  // to this client's assigned staff. Balances are computed from each member's
  // policy rules.
  const balances = (
    <div className="admin-card admin-section-card">
      <h2 className="admin-card-title">Balances</h2>
      {directory.length === 0 ? (
        <div className="admin-empty admin-empty--tall">No assigned team members.</div>
      ) : (
        <div className="admin-table-wrap">
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Approver</th>
                  <th>Policy start</th>
                  <th>Policy year</th>
                  <th>Opening balance</th>
                  <th>Accrued this year</th>
                  <th>Used this year</th>
                  <th>Available balance</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {directory.map((r) => (
                  <PreviewRow
                    key={r.id}
                    eyebrow="Time off"
                    title={r.name}
                    preview={
                      <LeaveShelf
                        leave={r.leave}
                        history={entries.filter((e) => e.teamMemberId === r.id)}
                        holidays={holidays}
                        warnings={r.warnings}
                        review={r.review}
                        reviewAction={
                          r.canConfirm && r.leave?.balance ? (
                            <ConfirmBalanceButton teamMemberId={r.id} stale={!!r.review && !r.review.current} />
                          ) : undefined
                        }
                        details={[
                          { label: "Approver", value: r.approverName || "Edge8" },
                          { label: "Team", value: r.team || "Not set" },
                          { label: "Location", value: r.location || "Not set" },
                          { label: "Work schedule", value: r.workSchedule || "Not set" },
                          {
                            label: "Status",
                            value: r.status ? (
                              <Badge tone={memberStatusTone(r.status)}>{humanize(r.status)}</Badge>
                            ) : (
                              "Not set"
                            ),
                          },
                        ]}
                      />
                    }
                  >
                    <td>
                      <span className="admin-cell-strong">{r.name}</span>
                    </td>
                    <td>{r.approverName || "Edge8"}</td>
                    <td>{r.leave?.anniversaryDate ? formatDate(r.leave.anniversaryDate) : muted}</td>
                    <td>
                      {r.leave?.balance?.policyYearStart ? (
                        <>
                          {r.leave.policy?.accrual.yearBasis === "anniversary" && `Year ${r.leave.balance.serviceYear} · `}
                          <span className="admin-cell-muted">since {formatDate(r.leave.balance.policyYearStart)}</span>
                        </>
                      ) : (
                        muted
                      )}
                    </td>
                    {r.computed ? (
                      <>
                        <td className="admin-cell-mono">{formatNumber(r.computed.openingDays)}</td>
                        <td className="admin-cell-mono">{formatNumber(r.computed.accruedPolicyYearDays)}</td>
                        <td className="admin-cell-mono">{formatNumber(r.computed.usedPolicyYearDays)}</td>
                        <td className="admin-cell-mono">
                          <span className={r.computed.remainingDays < 0 ? "u-warn" : undefined}>
                            {formatNumber(r.computed.remainingDays)}
                          </span>
                          {r.computed.pendingDays > 0 && (
                            <span className="admin-cell-muted"> · {formatNumber(r.computed.pendingDays)} pending</span>
                          )}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="admin-cell-mono">{muted}</td>
                        <td className="admin-cell-mono">{muted}</td>
                        <td className="admin-cell-mono">{muted}</td>
                        <td className="admin-cell-mono">{muted}</td>
                      </>
                    )}
                    <td>
                      {r.warnings.length > 0 ? (
                        <Badge tone="warn">{r.warnings.length} to check</Badge>
                      ) : r.review?.current ? (
                        <Badge tone="ok">Confirmed</Badge>
                      ) : r.leave?.balance ? (
                        <Badge tone="neutral">Not confirmed</Badge>
                      ) : (
                        muted
                      )}
                    </td>
                  </PreviewRow>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // The calendar, or every entry as a list, newest first.
  const calendar = (
    <ViewToggle
      views={[
        {
          key: "calendar",
          label: "Calendar",
          content: (
            <div className="admin-card admin-section-card">
              <TimeOffCalendar entries={calendarEntries} />
            </div>
          ),
        },
        {
          key: "list",
          label: "List",
          content: (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">History ({history.length})</h2>
              {history.length === 0 ? (
                <div className="admin-empty admin-empty--tall">No time-off history yet.</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Person</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((e) => {
                        const s = statusLabel(e.status);
                        return (
                          <tr key={e.id}>
                            <td>{e.name}</td>
                            <td>{leaveTypeLabel(e.leaveType)}</td>
                            <td>{dateRange(e)}</td>
                            <td>
                              <Badge tone={s.tone}>{s.text}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  );

  const policy =
    policies.length === 0 ? (
      <div className="admin-card admin-section-card">
        <div className="admin-empty admin-empty--tall">No leave policy assigned yet.</div>
      </div>
    ) : (
      <>
        {policies.map((p) => (
          <PolicyCard key={p.id} policy={p} />
        ))}
      </>
    );

  const tabs: TabDef[] = [
    { key: "overview", label: "Overview", count: isApprover ? decisionQueue.length : undefined, content: overview },
    { key: "balances", label: "Balances", content: balances },
    { key: "calendar", label: "Calendar", content: calendar },
    { key: "policy", label: "Policy", content: policy },
    // The guide reads its numbers from the first policy so it never contradicts
    // the Policy tab; a client with staff on two policies sees both cards there.
    { key: "how", label: "How it works", content: <HowItWorks policy={policies[0] ?? null} /> },
  ];
  const tabParam = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;

  return (
    <>
      <PageHead eyebrow="Client Portal" title="Time Off" sub="Who's out, and when, on your team." />
      <Tabs tabs={tabs} initialKey={tabParam} syncParam="tab" />
    </>
  );
}
