import { requirePermission } from "@/kernel/identity/access-request";
import { countEntity } from "@/entities/company-os";
import { companyOs } from "@/kernel/data/supabase";
import { byFirstName, personName } from "@/kernel/config/people-name";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { JobReqsTable, type JobReqRow } from "./JobReqsTable";
import { one } from "@/kernel/config/embedded";

// Data cache can freeze Supabase reads despite force-dynamic — see applications/page.tsx.
export const metadata = {
  title: "Job requisitions",
  description: "Open roles and their hiring status.",
};

// Talent office: job requisitions. Rows load once and the client table owns
// search, status filter, paging, and the manage shelf (edit, close, delete) —
// rows + shelf must be one client tree for the row click to work.
type Co = { name: string | null };
type Person = { display_name: string | null; full_name: string | null; preferred_name: string | null };
type RawReq = {
  id: string;
  title: string | null;
  employment_type: string | null;
  location: string | null;
  remote_policy: string | null;
  salary_min_cents: number | null;
  salary_max_cents: number | null;
  currency: string | null;
  status: string | null;
  opened_at: string | null;
  closed_at: string | null;
  description: string | null;
  slug: string | null;
  is_public: boolean;
  created_at: string;
  hiring_manager_id: string | null;
  companies: Co | Co[] | null;
  people: Person | Person[] | null;
  applications: { count: number }[] | null;
};

export default async function JobsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("hiring.ats");
  const [reqsRes, managersRes, openCount, filledCount] = await Promise.all([
    companyOs.from("job_requisitions").select(
        "id, title, employment_type, location, remote_policy, salary_min_cents, salary_max_cents, currency, status, opened_at, closed_at, description, slug, is_public, created_at, hiring_manager_id, companies!client_company_id(name), people!hiring_manager_id(display_name, full_name, preferred_name), applications(count)",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    // Anyone currently on the roster can own a req, so the picker is the live
    // team, not a hand-kept list of managers.
    companyOs
      .from("team_members")
      .select("person_id, people:people!person_id(display_name, full_name, preferred_name)")
      .in("status", ["active", "on_leave", "notice"]),
    countEntity("job_requisitions", { status: "open" }),
    countEntity("job_requisitions", { status: "filled" }),
  ]);

  const managers = ((managersRes.data ?? []) as unknown as { person_id: string; people: Person | Person[] | null }[])
    .map((m) => {
      const p = one(m.people);
      return { id: m.person_id, name: personName(p) };
    })
    .sort((a, b) => byFirstName(a.name, b.name));

  const error = reqsRes.error?.message ?? null;
  const rows: JobReqRow[] = ((reqsRes.data ?? []) as unknown as RawReq[]).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    companyName: one(r.companies)?.name ?? null,
    hiringManagerId: r.hiring_manager_id,
    hiringManagerName: r.people ? personName(one(r.people)) : null,
    status: r.status,
    employmentType: r.employment_type ?? "full_time",
    location: r.location,
    remotePolicy: r.remote_policy,
    salaryMinCents: r.salary_min_cents,
    salaryMaxCents: r.salary_max_cents,
    currency: r.currency ?? "usd",
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    description: r.description,
    isPublic: r.is_public,
    slug: r.slug,
    applicationCount: r.applications?.[0]?.count ?? 0,
    createdAt: r.created_at,
  }));

  return (
    <>
      <PageHead
        eyebrow="Talent"
        title="Job Reqs"
        sub={`${rows.length.toLocaleString()} ${rows.length === 1 ? "requisition" : "requisitions"}`}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Open" value={openCount} sub="accepting applications" />
        <MetricCard label="Filled" value={filledCount} sub="hired" />
      </div>

      <JobReqsTable rows={rows} managers={managers} />
    </>
  );
}
