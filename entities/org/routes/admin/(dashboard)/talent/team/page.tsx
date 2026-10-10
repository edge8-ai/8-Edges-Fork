import { requirePermission } from "@/kernel/identity/access-request";
import { selectCoachingOneOnOnes, selectCoachingProfiles } from "@/entities/coaching";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import { listEntity, countEntity } from "@/entities/company-os";
import { PageHead } from "@/kernel/ui/PageHead";
import { DataTable, type Column } from "@/kernel/ui/DataTable";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { formatDate, humanize } from "@/kernel/ui/format";
import { firstParam, mergeQuery, type SearchParamsObj } from "@/kernel/ui/url";
import { portalStatusesFor } from "@/entities/crm";
import { personName } from "@/kernel/config/people-name";
import {
  TeamShelfProvider,
  TeamShelfRow,
  type ShelfOptions,
  type TeamShelfRowData,
} from "./TeamShelf";
import { one } from "@/kernel/config/embedded";
import { mustRows } from "@/kernel/data/read";
import { ON_CHART_STATUSES } from "@/entities/org/lib/org-tree";

export const metadata = {
  title: "Team",
  description: "Edge8 team members and departments.",
};

// Talent office: internal team (persona=employee). Rows open an inline-editable
// shelf (TeamShelf); the Name still deep-links to the full Team Member profile.
type P = {
  display_name: string | null;
  full_name: string | null;
  preferred_name: string | null;
  email: string;
  phone: string | null;
  auth_user_id: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
};
type Position = { title: string | null; level: string | null; is_people_manager: boolean | null };
type Department = { name: string | null };
type TeamMember = {
  id: string;
  employee_number: string | null;
  employment_type: string | null;
  employment_stage: string | null;
  work_location: string | null;
  career_level: string | null;
  status: string | null;
  start_date: string | null;
  contract_start_date: string | null;
  probation_ends_on: string | null;
  end_date: string | null;
  termination_reason: string | null;
  created_at: string;
  person_id: string | null;
  manager_id: string | null;
  position_id: string | null;
  department_id: string | null;
  people: P | P[] | null;
  positions: Position | Position[] | null;
  departments: Department | Department[] | null;
};

const PAGE_SIZE = 25;
const SORTABLE = new Set([
  "name",
  "employee_number",
  "title",
  "employment_type",
  "work_location",
  "career_level",
  "status",
  "start_date",
  "created_at",
]);

// Some columns aren't direct team_members columns: Name lives on the joined
// `people` row, Title on the joined `positions` row. Map their sort key to the
// embedded-column ordering expression PostgREST understands
// (order=<embed>(<col>)). Everything else sorts by its own key.
const ORDER_COLUMN: Record<string, string> = {
  name: "people(display_name)",
  title: "positions(title)",
};

const dash = <span className="admin-cell-muted">—</span>;

// Segment tabs. `filter` is applied on top of search/sort. Order matters: the
// first entry is the default when no (or an unknown) ?seg is present.
type SegKey = "current" | "pre-start" | "past" | "contractors" | "all";
const SEGMENTS: { key: SegKey; label: string; filter: NonNullable<Parameters<typeof countEntity>[1]> }[] = [
  { key: "current", label: "Current", filter: { status: "active" } },
  { key: "pre-start", label: "Pre-Start", filter: { status: "pre_start" } },
  { key: "past", label: "Past", filter: { status: ["terminated", "alumni"] } },
  { key: "contractors", label: "Contractors", filter: { employment_type: "contract" } },
  { key: "all", label: "All", filter: {} },
];

const PORTAL_LABEL: Record<string, string> = {
  active: "Signed in",
  invited: "Invited, never signed in",
  none: "Not invited",
};

export default async function TeamPage(props: { searchParams: Promise<SearchParamsObj> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.people");
  const searchParams = await props.searchParams;
  const page = Math.max(1, Number(firstParam(searchParams.page) ?? "1") || 1);
  const q = firstParam(searchParams.q) ?? "";
  const sortParam = firstParam(searchParams.sort);
  const sort = sortParam && SORTABLE.has(sortParam) ? sortParam : "name";
  const dir = firstParam(searchParams.dir) === "desc" ? "desc" : "asc";

  const segParam = firstParam(searchParams.seg);
  const seg = SEGMENTS.find((s) => s.key === segParam) ?? SEGMENTS[0];

  // Search matches the person's name, which lives on the joined `people` row.
  // PostgREST only narrows parent rows by an embedded column when the embed is
  // an inner join, so ask for `!inner` while searching. Without a query the
  // embed stays a left join, so a team member with no linked person still
  // appears in the list.
  const peopleEmbed = `people!person_id${q ? "!inner" : ""}(display_name, full_name, preferred_name, email, phone, auth_user_id, city, country, linkedin_url)`;

  // List the active segment's rows, count every segment for its tab badge, and
  // load the picker option lists (departments, position catalog, all members for
  // the manager picker + distinct work locations). The option lists don't depend
  // on the page's rows, so they run in the same wave.
  const [list, counts, deptRes, posRes, membersRes] = await Promise.all([
    listEntity<TeamMember>(
      "team_members",
      "id, employee_number, employment_type, employment_stage, work_location, career_level, status, start_date, contract_start_date, probation_ends_on, end_date, termination_reason, created_at, person_id, manager_id, position_id, department_id, " +
        `${peopleEmbed}, positions!position_id(title, level, is_people_manager), departments!department_id(name)`,
      {
        page,
        pageSize: PAGE_SIZE,
        search: q,
        searchEmbed: { table: "people", columns: ["display_name", "full_name", "preferred_name"] },
        sort: ORDER_COLUMN[sort] ?? sort,
        dir,
        filters: seg.filter,
      },
    ),
    Promise.all(SEGMENTS.map((s) => countEntity("team_members", s.filter))),
    companyOs.from("departments").select("id, name").order("name"),
    companyOs.from("positions").select("id, title, level, is_people_manager").eq("active", true).order("title"),
    companyOs
      .from("team_members")
      .select("id, work_location, status, people!person_id(display_name, preferred_name, full_name, email)")
      .order("created_at"),
  ]);
  const { rows, total, pageSize, error } = list;

  // Portal status needs auth.users.last_sign_in_at, which costs a service-role
  // round trip, so it is asked once for all the visible rows and answered per
  // row from what comes back — the shelf shows invited against signed in.
  //
  // The "Last 1-1" column reads the newest held coaching session per member.
  const rowIds = rows.map((r) => r.id);

  const [portalStatus, coachingRes] = await Promise.all([
    portalStatusesFor(rows.map((r) => one(r.people)?.auth_user_id)),
    rowIds.length
      ? selectCoachingProfiles("id, team_member_id").in("team_member_id", rowIds)
      : Promise.resolve({ data: null }),
  ]);

  // Last held 1-1 per visible team member (coaching profile -> newest held row).
  const profileByMember = new Map<string, string>();
  for (const p of ((coachingRes.data as { id: string; team_member_id: string }[] | null) ?? [])) {
    profileByMember.set(p.team_member_id, p.id);
  }
  const lastOneOnOne = new Map<string, string>(); // team_member_id -> held_on
  if (profileByMember.size > 0) {
    const { data: meetings, error: meetingsError } = await selectCoachingOneOnOnes("coaching_profile_id, held_on")
      .in("coaching_profile_id", [...profileByMember.values()])
      .eq("status", "held")
      .is("archived_at", null);
    if (meetingsError) console.error("[talent/team] coaching meetings load failed:", meetingsError.message);
    const latestByProfile = new Map<string, string>();
    for (const m of ((meetings as { coaching_profile_id: string; held_on: string }[] | null) ?? [])) {
      const cur = latestByProfile.get(m.coaching_profile_id);
      if (!cur || m.held_on > cur) latestByProfile.set(m.coaching_profile_id, m.held_on);
    }
    for (const [memberId, profileId] of profileByMember) {
      const held = latestByProfile.get(profileId);
      if (held) lastOneOnOne.set(memberId, held);
    }
  }

  // Shelf option lists. A failed members read raises: an empty manager list
  // would read as "nobody can manage", which is a wrong answer, not a gap.
  type MemberRow = { id: string; work_location: string | null; status: string | null; people: P | P[] | null };
  const allMembers = mustRows(membersRes, "[talent/team] team_members options") as unknown as MemberRow[];
  const shelfOptions: ShelfOptions = {
    departments: ((deptRes.data as { id: string; name: string | null }[] | null) ?? []).map((d) => ({
      id: d.id,
      name: d.name ?? "(unnamed)",
    })),
    positions: ((posRes.data as { id: string; title: string | null; level: string | null; is_people_manager: boolean | null }[] | null) ?? []).map((p) => ({
      id: p.id,
      title: p.title ?? "(untitled)",
      level: p.level,
      isPeopleManager: !!p.is_people_manager,
    })),
    // Everyone, so a record whose manager has left still shows that name. The
    // picker offers only the people on the chart today (`current`), plus a
    // departed manager while they are still that record's value, marked
    // "(has left)", so the field tells the truth and can be changed away.
    managers: allMembers
      .map((m) => ({
        id: m.id,
        name: personName(one(m.people)),
        current: (ON_CHART_STATUSES as readonly string[]).includes(m.status ?? ""),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    workLocations: [...new Set(allMembers.map((m) => m.work_location).filter((x): x is string => !!x))].sort(),
  };

  // Flatten each visible row into the serializable shape the client shelf edits.
  const shelfData = new Map<string, TeamShelfRowData>();
  for (const r of rows) {
    const p = one(r.people);
    const pos = one(r.positions);
    const portal = portalStatus(p?.auth_user_id);
    shelfData.set(r.id, {
      id: r.id,
      personId: r.person_id,
      name: p ? personName(p) : "Team member",
      preferred_name: p?.preferred_name ?? null,
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      linkedin_url: p?.linkedin_url ?? null,
      city: p?.city ?? null,
      country: p?.country ?? null,
      status: r.status,
      employment_stage: r.employment_stage,
      employment_type: r.employment_type,
      work_location: r.work_location,
      start_date: r.start_date,
      contract_start_date: r.contract_start_date,
      probation_ends_on: r.probation_ends_on,
      end_date: r.end_date,
      termination_reason: r.termination_reason,
      manager_id: r.manager_id,
      department_id: r.department_id,
      position_id: r.position_id,
      position_title: pos?.title ?? null,
      position_level: pos?.level ?? null,
      is_people_manager: pos?.is_people_manager ?? null,
      portalLabel: PORTAL_LABEL[portal] ?? "Not invited",
      isPast: r.status === "terminated" || r.status === "alumni",
    });
  }

  const columns: Column<TeamMember>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      cell: (r) => {
        const p = one(r.people);
        return <span className="admin-cell-strong">{p ? personName(p) : "View"}</span>;
      },
    },
    { key: "employee_number", header: "Employee #", sortable: true, cell: (r) => (r.employee_number ? <span className="admin-cell-mono">{r.employee_number}</span> : dash) },
    { key: "title", header: "Title", sortable: true, cell: (r) => one(r.positions)?.title || dash },
    {
      key: "employment_type",
      header: "Type",
      sortable: true,
      // Contractors get a distinct (pink) badge so they stand out from staff.
      cell: (r) =>
        r.employment_type ? (
          <Badge tone={r.employment_type === "contract" ? "pink" : "neutral"}>
            {humanize(r.employment_type)}
          </Badge>
        ) : (
          dash
        ),
    },
    { key: "work_location", header: "Location", sortable: true, cell: (r) => r.work_location || dash },
    { key: "career_level", header: "Level", sortable: true, cell: (r) => (r.career_level ? humanize(r.career_level) : dash) },
    { key: "status", header: "Status", sortable: true, cell: (r) => (r.status ? <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> : dash) },
    { key: "start_date", header: "Started", sortable: true, cell: (r) => (r.start_date ? formatDate(r.start_date) : dash) },
    {
      key: "last_one_on_one",
      header: "Last 1-1",
      cell: (r) => {
        const held = lastOneOnOne.get(r.id);
        return held ? formatDate(held) : dash;
      },
    },
  ];

  return (
    <>
      <PageHead eyebrow="Talent" title="Team" sub={`${total.toLocaleString()} ${total === 1 ? "team member" : "team members"}`} />
      {error && <div className="admin-alert admin-alert--err u-mb-4">{error}</div>}
      <nav className="admin-tabs" role="tablist" aria-label="Team segment">
        {SEGMENTS.map((s, i) => (
          <Link
            key={s.key}
            role="tab"
            aria-selected={s.key === seg.key}
            className={`admin-tab${s.key === seg.key ? " is-active" : ""}`}
            href={"/admin/talent/team" + mergeQuery(searchParams, { seg: s.key === "current" ? null : s.key, page: 1 })}
          >
            {s.label} ({counts[i].toLocaleString()})
          </Link>
        ))}
      </nav>
      <TeamShelfProvider options={shelfOptions}>
        <DataTable
          columns={columns}
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          sort={sort}
          dir={dir}
          basePath="/admin/talent/team"
          searchParams={searchParams}
          searchPlaceholder="Search by name…"
          emptyText={seg.key === "contractors" ? "No contractors yet." : seg.key === "pre-start" ? "No pre-start hires." : "No team members match."}
          renderRow={(r, cells) => {
            const data = shelfData.get(r.id);
            return data ? <TeamShelfRow row={data}>{cells}</TeamShelfRow> : <tr>{cells}</tr>;
          }}
        />
      </TeamShelfProvider>
    </>
  );
}
