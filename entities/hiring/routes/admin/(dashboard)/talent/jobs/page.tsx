import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { byFirstName, NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { PageHead } from "@/kernel/ui/PageHead";
import { JobReqsTable, type JobReqRow } from "./JobReqsTable";
import type { RoleCandidate } from "./OpenRoleCards";
import { one } from "@/kernel/config/embedded";
import { CURRENT_TEAM_STATUSES } from "@/kernel/identity/team-statuses";
import { countJobRequisitions } from "@/entities/hiring/lib/lists";

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
  // The page's declared permission (ADR 0013).
  await requirePermission("hiring.ats");
  const [reqsRes, managersRes, openCount, filledCount, inFlightRes] = await Promise.all([
    companyOs.from("job_requisitions").select(
        "id, title, employment_type, location, remote_policy, salary_min_cents, salary_max_cents, currency, status, opened_at, closed_at, description, slug, is_public, created_at, hiring_manager_id, headcount, companies!client_company_id(name), people!hiring_manager_id(display_name, full_name, preferred_name), applications(count)",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    // Anyone currently on the roster can own a req, so the picker is the live
    // team, not a hand-kept list of managers.
    companyOs
      .from("team_members")
      .select("person_id, people:people!person_id(display_name, full_name, preferred_name)")
      .in("status", CURRENT_TEAM_STATUSES),
    countJobRequisitions({ status: "open" }),
    countJobRequisitions({ status: "filled" }),
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
  const managers = ((managersRes.data ?? []) as unknown as { person_id: string; people: Person | Person[] | null }[])
    .map((m) => {
      const p = one(m.people);
      return { id: m.person_id, name: personName(p) };
    })
    .sort((a, b) => byFirstName(a.name, b.name));

  // A failed read shows as an error, never as roles with nobody in them.
  const error = reqsRes.error?.message ?? inFlightRes.error?.message ?? null;
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
    headcount: r.headcount,
    stageCounts: stageCounts.get(r.id) ?? {},
    candidates: candidates.get(r.id) ?? [],
  }));

  return (
    <>
      <PageHead
        eyebrow="Talent · Job reqs"
        title={`${openCount.toLocaleString()} ${openCount === 1 ? "role is" : "roles are"} open. ${filledCount.toLocaleString()} ${filledCount === 1 ? "is" : "are"} filled.`}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      <JobReqsTable rows={rows} managers={managers} />
    </>
  );
}
