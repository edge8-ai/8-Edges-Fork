import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { selectTeamDirectory } from "@/entities/org";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { FilterBar } from "@/kernel/ui/FilterBar";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import {
  LeaveShelf,
  formatNumber,
  getBalanceReviews,
  getMemberLeave,
  hoursToDays,
  leaveWarnings,
  listHolidayDatesCovering,
  selectTimeOff,
  type ShelfLeaveEntry,
} from "@/entities/time-off";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Time Off — History",
  description: "Team leave policies, work schedules, and balances.",
};

// Operations → Time Off → History. One row per team member with their approver,
// team, leave policy, policy dates and balance. Data comes from
// company_os.team_directory (team is the department, location and work schedule
// are team_members fields); the balance is computed from the member's leave
// policy rules, and a policy without rules shows none. Clicking a row opens the
// same leave shelf the client portal shows (dates, how the balance adds up, the
// ledger and the leave history), with a link to the full profile.
//
// The balance columns are computed here rather than stored, so sorting and the
// team / employee filters run in memory over the view's rows (a team, not a
// ledger: the whole directory is a few dozen people). Sort, filter and search
// live in the URL like every other admin list.
type DirectoryRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  preferred_name: string | null;
  email: string;
  status: string | null;
  team: string | null;
  location: string | null;
  leave_policy: string | null;
  work_schedule: string | null;
  manager_name: string | null;
};

type TimeOffRow = {
  id: string;
  team_member_id: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  is_half_day: boolean;
};

type Check = "warn" | "unconfirmed" | "confirmed" | "none";

// One fully resolved row: the directory fields plus everything the table shows
// or sorts on, so the sort comparator reads plain values.
type HistoryRow = DirectoryRow & {
  name: string;
  policyName: string | null;
  policyStart: string | null;
  hoursPerDay: number;
  openingHours: number | null;
  accruedPolicyYearHours: number | null;
  usedPolicyYearHours: number | null;
  remainingHours: number | null;
  warningCount: number;
  check: Check;
};

const VIEWS = ["activated", "deactivated", "all"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { activated: "Activated", deactivated: "Deactivated", all: "All" };

const SORTABLE = new Set([
  "name",
  "manager_name",
  "team",
  "policyName",
  "policyStart",
  "status",
  "openingHours",
  "accruedPolicyYearHours",
  "usedPolicyYearHours",
  "remainingHours",
  "check",
]);

// Rows that need attention sort first when ascending, so "Check ↑" is a to-do list.
const CHECK_RANK: Record<Check, number> = { warn: 0, unconfirmed: 1, confirmed: 2, none: 3 };

const BASE_PATH = "/admin/operations/time-off/history";
const muted = <span className="admin-cell-muted">—</span>;

function compareRows(a: HistoryRow, b: HistoryRow, sort: string, dir: "asc" | "desc"): number {
  const sign = dir === "desc" ? -1 : 1;
  if (sort === "check") return sign * (CHECK_RANK[a.check] - CHECK_RANK[b.check]);
  const av = a[sort as keyof HistoryRow] as string | number | null;
  const bv = b[sort as keyof HistoryRow] as string | number | null;
  // Missing values sit at the bottom in either direction.
  if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
  if (bv === null || bv === undefined) return -1;
  if (typeof av === "number" && typeof bv === "number") return sign * (av - bv);
  return sign * String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
}

export default async function TimeOffHistoryPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("time-off.manage");
  const searchParams = await props.searchParams;
  const viewParam = firstParam(searchParams.view);
  const view: View = (VIEWS as readonly string[]).includes(viewParam ?? "") ? (viewParam as View) : "activated";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";
  const q = (firstParam(searchParams.q) ?? "").trim().toLowerCase();
  const teamFilter = firstParam(searchParams.team) ?? "";
  const employeeFilter = firstParam(searchParams.employee) ?? "";

  const { data, error } = await selectTeamDirectory(
    `id, ${NAME_COLUMNS}, status, team, location, leave_policy, work_schedule, manager_name`,
  ).order("full_name", { ascending: true });

  const directory = (data ?? []) as unknown as DirectoryRow[];
  const inView = directory.filter((r) =>
    view === "all" ? true : view === "activated" ? r.status === "active" : r.status !== "active",
  );
  const ids = inView.map((r) => r.id);
  const [leaveById, timeOffRes] = await Promise.all([
    getMemberLeave(ids),
    ids.length > 0
      ? selectTimeOff("id, team_member_id, leave_type, status, start_date, end_date, is_half_day")
          .in("team_member_id", ids)
          .order("start_date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (timeOffRes.error) console.error("[time-off/history] time_off read failed:", timeOffRes.error.message);
  // Client managers sign off in the portal; this page shows where each stands.
  const reviews = await getBalanceReviews(leaveById);
  const historyByMember = new Map<string, ShelfLeaveEntry[]>();
  for (const t of (timeOffRes.data ?? []) as unknown as TimeOffRow[]) {
    const list = historyByMember.get(t.team_member_id) ?? [];
    list.push({
      id: t.id,
      leaveType: t.leave_type,
      status: t.status,
      startDate: t.start_date,
      endDate: t.end_date,
      isHalfDay: t.is_half_day,
    });
    historyByMember.set(t.team_member_id, list);
  }

  // One calendar for every span this page counts days over, so an entry that
  // predates the stored count is not charged for days the office was shut.
  const holidays = await listHolidayDatesCovering(
    [...historyByMember.values()].flat().flatMap((e) => [e.startDate, e.endDate]),
  );

  const resolved: HistoryRow[] = inView.map((r) => {
    const leave = leaveById.get(r.id) ?? null;
    const b = leave?.balance ?? null;
    const review = reviews.get(r.id) ?? null;
    const warningCount = leave ? leaveWarnings(leave, review).length : 0;
    const check: Check = warningCount > 0 ? "warn" : review?.current ? "confirmed" : b ? "unconfirmed" : "none";
    return {
      ...r,
      name: personName(r),
      policyName: leave?.policy?.name ?? r.leave_policy ?? null,
      policyStart: leave?.anniversaryDate ?? null,
      hoursPerDay: leave?.policy?.accrual.hoursPerDay ?? 8,
      openingHours: b?.openingHours ?? null,
      accruedPolicyYearHours: b?.accruedPolicyYearHours ?? null,
      usedPolicyYearHours: b?.usedPolicyYearHours ?? null,
      remainingHours: b?.remainingHours ?? null,
      warningCount,
      check,
    };
  });

  // Filter options come from the whole view, not the filtered result, so a
  // chosen team never empties the employee list.
  const teams = [...new Set(resolved.map((r) => r.team).filter((t): t is string => !!t))].sort((a, b) =>
    a.localeCompare(b),
  );
  const employees = resolved.map((r) => ({ value: r.id, label: r.name }));

  const rows = resolved
    .filter((r) => !teamFilter || r.team === teamFilter)
    .filter((r) => !employeeFilter || r.id === employeeFilter)
    .filter(
      (r) =>
        !q ||
        [r.name, r.email, r.team, r.manager_name, r.policyName].some((v) => v?.toLowerCase().includes(q)),
    )
    .sort((a, b) => compareRows(a, b, sort, dir));

  const columns: Column<HistoryRow>[] = [
    { key: "name", header: "Employee", sortable: true, cell: (r) => <span className="admin-cell-strong">{r.name}</span> },
    { key: "manager_name", header: "Approver", sortable: true, cell: (r) => r.manager_name || muted },
    { key: "team", header: "Team", sortable: true, cell: (r) => r.team || muted },
    { key: "policyName", header: "Leave policy", sortable: true, cell: (r) => r.policyName ?? muted },
    {
      key: "policyStart",
      header: "Policy start",
      sortable: true,
      cell: (r) => (r.policyStart ? formatDate(r.policyStart) : muted),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> : muted),
    },
    {
      key: "openingHours",
      header: "Opening balance",
      sortable: true,
      className: "admin-cell-mono",
      cell: (r) => (r.openingHours === null ? muted : formatNumber(hoursToDays(r.openingHours, r.hoursPerDay))),
    },
    {
      key: "accruedPolicyYearHours",
      header: "Accrued this year",
      sortable: true,
      className: "admin-cell-mono",
      cell: (r) =>
        r.accruedPolicyYearHours === null ? muted : formatNumber(hoursToDays(r.accruedPolicyYearHours, r.hoursPerDay)),
    },
    {
      key: "usedPolicyYearHours",
      header: "Used this year",
      sortable: true,
      className: "admin-cell-mono",
      cell: (r) =>
        r.usedPolicyYearHours === null ? muted : formatNumber(hoursToDays(r.usedPolicyYearHours, r.hoursPerDay)),
    },
    {
      key: "remainingHours",
      header: "Available balance",
      sortable: true,
      className: "admin-cell-mono",
      cell: (r) =>
        r.remainingHours === null ? (
          muted
        ) : (
          <>
            <span className={r.remainingHours < 0 ? "u-warn" : undefined}>
              {formatNumber(hoursToDays(r.remainingHours, r.hoursPerDay))} d
            </span>
            <span className="admin-cell-muted"> · {formatNumber(r.remainingHours)} h</span>
          </>
        ),
    },
    {
      key: "check",
      header: "Check",
      sortable: true,
      cell: (r) =>
        r.check === "warn" ? (
          <Badge tone="warn">{r.warningCount} to check</Badge>
        ) : r.check === "confirmed" ? (
          <Badge tone="ok">Confirmed</Badge>
        ) : r.check === "unconfirmed" ? (
          <Badge tone="neutral">Not confirmed</Badge>
        ) : (
          muted
        ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow="Operations · Time Off"
        title="History"
        sub="Leave policies, policy years and balances across the team. Open a person to check the ledger."
      />

      <div className="admin-tabs" role="tablist">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "activated" ? BASE_PATH : `${BASE_PATH}?view=${v}`}
            role="tab"
            aria-selected={view === v}
            className={`admin-tab${view === v ? " is-active" : ""} u-link-plain`}
          >
            {VIEW_LABEL[v]}
          </Link>
        ))}
      </div>

      {error && <div className="admin-alert admin-alert--err u-mb-4">{error.message}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={Math.max(rows.length, 1)}
        sort={sort}
        dir={dir}
        basePath={BASE_PATH}
        searchParams={searchParams}
        searchPlaceholder="Search name, team, approver or policy…"
        emptyText={
          inView.length === 0
            ? `No ${view === "deactivated" ? "deactivated" : view === "all" ? "" : "active "}team members.`.replace("  ", " ")
            : "No team members match."
        }
        filterBar={
          <FilterBar
            basePath={BASE_PATH}
            searchParams={searchParams}
            filters={[
              { key: "team", label: "Team", options: teams.map((t) => ({ value: t, label: t })) },
              { key: "employee", label: "Employee", options: employees },
            ]}
          />
        }
        getRowPreview={(r) => ({
          eyebrow: "Time off",
          title: r.name,
          body: (
            <LeaveShelf
              leave={leaveById.get(r.id) ?? null}
              history={historyByMember.get(r.id) ?? []}
              holidays={holidays}
              warnings={leaveById.has(r.id) ? leaveWarnings(leaveById.get(r.id)!, reviews.get(r.id) ?? null) : []}
              review={reviews.get(r.id) ?? null}
              details={[
                { label: "Approver", value: r.manager_name || "Not set" },
                { label: "Team", value: r.team || "Not set" },
                { label: "Location", value: r.location || "Not set" },
                { label: "Work schedule", value: r.work_schedule || "Not set" },
                { label: "Profile", value: <Link href={`/admin/talent/team/${r.id}`}>Open full profile</Link> },
              ]}
            />
          ),
        })}
      />
    </>
  );
}
