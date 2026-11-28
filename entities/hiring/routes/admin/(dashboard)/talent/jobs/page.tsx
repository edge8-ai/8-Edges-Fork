import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { companyOs } from "@/kernel/data/supabase";
import { byFirstName, NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { PageHead } from "@/kernel/ui/PageHead";
import { JobReqsTable, type JobReqRow } from "./JobReqsTable";
import { JobReqCreate } from "./JobReqCreate";
import type { JobFieldOptions } from "./JobPeopleFields";
import type { RoleCandidate } from "./OpenRoleCards";
import { openJobsSub } from "./roles";
import { one } from "@/kernel/config/embedded";
import { CURRENT_TEAM_STATUSES } from "@/kernel/identity/team-statuses";
import { countJobRequisitions } from "@/entities/hiring/lib/lists";
import { listCompanyOptions, seesEveryClient } from "@/entities/crm";

// Data cache can freeze Supabase reads despite force-dynamic — see applications/page.tsx.
export const metadata = {
  title: "Jobs",
  description: "Open jobs, their candidates, and past jobs.",
};

// Talent office: jobs (job_requisitions). Rows load once and the client table
// owns search, status filter, paging, and the drawer (edit, close, delete) —
// rows + drawer must be one client tree for the row click to work.
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
  recruiter_id: string | null;
  client_company_id: string | null;
  headcount: number | null;
  companies: Co | Co[] | null;
  people: Person | Person[] | null;
  applications: { count: number }[] | null;
};

type RawCandidate = {
  id: string;
  status: string | null;
  rating: number | null;
  ai_rating: number | null;
  metadata: { family_screen?: { rating?: number } } | null;
  applied_at: string | null;
  archived_at: string | null;
  job_requisition_id: string | null;
  people: (NamedPerson & { candidate_profile: Cp | Cp[] | null }) | (NamedPerson & { candidate_profile: Cp | Cp[] | null })[] | null;
  application_stages: { name: string | null } | { name: string | null }[] | null;
};
type Cp = { headline: string | null; current_title: string | null };

export default async function JobsPage() {
  // The page's declared permission (ADR 0013). It is also what closing and
  // reopening a req ask for, so the cards are told whether to offer them.
  const access = await requirePermission("hiring.ats");
  const [reqsRes, teamRes, companies, openCount, inFlightRes] = await Promise.all([
    companyOs.from("job_requisitions").select(
        "id, title, employment_type, location, remote_policy, salary_min_cents, salary_max_cents, currency, status, opened_at, closed_at, description, slug, is_public, created_at, hiring_manager_id, recruiter_id, client_company_id, headcount, companies!client_company_id(name), people!hiring_manager_id(display_name, full_name, preferred_name), applications(count)",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    // Anyone currently on the roster can manage or recruit for a job, so both
    // pickers are the live team, not a hand-kept list. A manager is a person and
    // a recruiter a team_members row, so each keeps its own id.
    companyOs
      .from("team_members")
      .select("id, person_id, people:people!person_id(display_name, full_name, preferred_name)")
      .in("status", CURRENT_TEAM_STATUSES),
    // The client a staffing job is for: any active company in CRM.
    listCompanyOptions(),
    countJobRequisitions({ status: "open" }),
    // Every application to an open role, archived ones included: an application
    // sits under its job req, so this page is where they are listed. The cards
    // count the live ones by stage and hide the archived until asked.
    companyOs
      .from("applications")
      .select(`id, status, rating, ai_rating, metadata, applied_at, archived_at, job_requisition_id, people!person_id(${NAME_COLUMNS}, candidate_profile(headline, current_title)), application_stages(name), job_requisitions!inner(status)`)
      .eq("job_requisitions.status", "open")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);

  const stageCounts = new Map<string, Record<string, number>>();
  const candidates = new Map<string, RoleCandidate[]>();
  for (const a of (inFlightRes.data ?? []) as unknown as RawCandidate[]) {
    if (!a.job_requisition_id) continue;
    const stage = one(a.application_stages)?.name ?? null;
    const p = one(a.people);
    const cp = one(p?.candidate_profile ?? null);
    const list = candidates.get(a.job_requisition_id) ?? [];
    list.push({
      id: a.id,
      name: personName(p, null),
      headline: cp?.headline ?? cp?.current_title ?? null,
      stageName: stage,
      status: a.status,
      rating: a.rating,
      // The family screen (the Candidate Pool score) first, else the per-req screen.
      aiRating: a.metadata?.family_screen?.rating ?? a.ai_rating,
      appliedAt: a.applied_at,
      archived: Boolean(a.archived_at),
    });
    candidates.set(a.job_requisition_id, list);
    if (a.archived_at || !stage) continue;
    const counts = stageCounts.get(a.job_requisition_id) ?? {};
    counts[stage] = (counts[stage] ?? 0) + 1;
    stageCounts.set(a.job_requisition_id, counts);
  }
  const members = ((teamRes.data ?? []) as unknown as { id: string; person_id: string; people: Person | Person[] | null }[])
    .map((m) => ({ id: m.id, personId: m.person_id, name: personName(one(m.people)) }))
    .sort((a, b) => byFirstName(a.name, b.name));
  // What the cards, the drawer and New job may offer (ADR 0014).
  const may = mayProp(access, ["hiring.ats"]);
  const options: JobFieldOptions = {
    team: members.map((m) => ({ id: m.personId, name: m.name })),
    recruiters: members.map((m) => ({ id: m.id, name: m.name })),
    companies,
    // Contacts are CRM's to show (PR #2120): only a viewer who may see client
    // contacts picks a client's hiring manager from them.
    canPickContacts: seesEveryClient(access),
  };

  // A failed read shows as an error, never as roles with nobody in them, nor
  // as pickers with nobody in them.
  const error = reqsRes.error?.message ?? inFlightRes.error?.message ?? teamRes.error?.message ?? null;
  const rows: JobReqRow[] = ((reqsRes.data ?? []) as unknown as RawReq[]).map((r) => ({
    id: r.id,
    title: r.title ?? "",
    companyName: one(r.companies)?.name ?? null,
    hiringManagerId: r.hiring_manager_id,
    hiringManagerName: r.people ? personName(one(r.people)) : null,
    clientCompanyId: r.client_company_id,
    recruiterId: r.recruiter_id,
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
    headcount: r.headcount,
    stageCounts: stageCounts.get(r.id) ?? {},
    candidates: candidates.get(r.id) ?? [],
  }));

  // The head says what is open today and what waits on HR among it. It used to
  // count every job filled since 2024, which said nothing about today.
  const sub = error ? null : openJobsSub(rows.filter((r) => r.status === "open"));
  return (
    <>
      <PageHead
        eyebrow="Talent · Jobs"
        title={openCount === 0 ? "No jobs are open." : `${openCount.toLocaleString()} ${openCount === 1 ? "job is" : "jobs are"} open.`}
        sub={sub ?? undefined}
        action={<JobReqCreate options={options} may={may} />}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      <JobReqsTable rows={rows} options={options} may={may} />
    </>
  );
}
