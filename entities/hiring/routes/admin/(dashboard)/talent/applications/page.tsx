import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { companyOs } from "@/kernel/data/supabase";
import {
  STAGE_LEAD,
  STAGE_DISCOVERY,
  STAGE_PROPOSAL,
  STAGE_WON,
  STAGE_LOST,
  STAGE_NEUTRAL,
} from "@/kernel/ui/stageColors";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import type { KanbanColumn } from "@/kernel/ui/KanbanBoard";
import { type AppRow } from "./ApplicationsTable";
import { ApplicationsView } from "./ApplicationsView";
import type { StageMap } from "./ApplicationsBoard";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Vercel's data cache can freeze Supabase reads despite force-dynamic (see the
// time-off pages) — a stale list here hides freshly added candidates while the
// duplicate guard still sees them, so pin the data cache off.
export const metadata = {
  title: "Applications",
  description: "Job applications moving through the hiring pipeline.",
};

// Talent office: applications to OPEN job reqs only, joined straight to the
// person (the candidates table is retired). Recruiting-profile fields live on
// the candidate_profile satellite, embedded through the person. Rows load once
// and the client table handles search, the job-req filter, paging, and the
// manage shelf. Closed reqs' applications live on the Candidate Pool page.
type Cp = {
  headline: string | null;
  current_title: string | null;
  portfolio_url: string | null;
  do_not_hire: boolean;
};
type P = NamedPerson & {
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  candidate_profile: Cp | Cp[] | null;
};
type Jr = { title: string | null; status: string | null };
type St = { name: string | null };
type RawApp = {
  id: string;
  status: string | null;
  rating: number | null;
  ai_rating: number | null;
  applied_at: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  current_stage_id: string | null;
  resume_document_id: string | null;
  job_requisition_id: string | null;
  person_id: string | null;
  metadata: { family_screen?: { rating?: number } } | null;
  archived_at: string | null;
  people: P | P[] | null;
  job_requisitions: Jr | Jr[] | null;
  application_stages: St | St[] | null;
};

// Column accents keyed by stage_kind so terminal columns always read as
// won/lost regardless of how many stages a req defines.
const KIND_ACCENT: Record<string, string> = {
  screen: STAGE_LEAD,
  interview: STAGE_DISCOVERY,
  offer: STAGE_PROPOSAL,
  hired: STAGE_WON,
  rejected: STAGE_LOST,
};

type StageRow = {
  id: string;
  name: string | null;
  position: number | null;
  stage_kind: string | null;
  job_requisition_id: string | null;
};

export default async function ApplicationsPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("hiring.ats");
  // Only applications whose req is still open — the inner join makes the
  // status filter on the embedded req drop non-matching rows.
  const appsRes = await companyOs.from("applications").select(
      `id, status, rating, ai_rating, applied_at, decided_at, rejection_reason, current_stage_id, resume_document_id, job_requisition_id, person_id, metadata, archived_at, people!person_id(${NAME_COLUMNS}, phone, linkedin_url, candidate_profile(headline, current_title, portfolio_url, do_not_hire)), job_requisitions!inner(title, status), application_stages(name)`,
    )
    .eq("job_requisitions.status", "open")
    .order("created_at", { ascending: false })
    .limit(2000);

  // Stages of open reqs, for the board: columns merge by stage name (all reqs
  // share the same template today) and stageMap lets a drag resolve the name
  // back to the stage id on the card's own req.
  const stagesRes = await companyOs.from("application_stages").select("id, name, position, stage_kind, job_requisition_id, job_requisitions!inner(status)")
    .eq("job_requisitions.status", "open")
    .order("position");

  const stages = (stagesRes.data ?? []) as unknown as StageRow[];
  const columnOrder = new Map<string, { position: number; kind: string | null }>();
  const stageMap: StageMap = {};
  for (const s of stages) {
    if (!s.name || !s.job_requisition_id) continue;
    const seen = columnOrder.get(s.name);
    if (!seen || (s.position ?? 99) < seen.position) {
      columnOrder.set(s.name, { position: s.position ?? 99, kind: s.stage_kind });
    }
    (stageMap[s.job_requisition_id] ??= {})[s.name] = s.id;
  }
  const stageColumns: KanbanColumn[] = [...columnOrder.entries()]
    .sort((a, b) => a[1].position - b[1].position)
    .map(([name, meta]) => ({
      id: name,
      label: name,
      accent: (meta.kind && KIND_ACCENT[meta.kind]) || STAGE_NEUTRAL,
    }));

  const error = appsRes.error?.message ?? stagesRes.error?.message ?? null;
  const raw = (appsRes.data ?? []) as unknown as RawApp[];
  const rows: AppRow[] = raw.map((r) => {
    const p = one(r.people);
    const cp = one(p?.candidate_profile ?? null);
    return {
      id: r.id,
      candidateName: personName(p, null),
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      headline: cp?.headline ?? null,
      currentTitle: cp?.current_title ?? null,
      linkedinUrl: p?.linkedin_url ?? null,
      portfolioUrl: cp?.portfolio_url ?? null,
      doNotHire: Boolean(cp?.do_not_hire),
      personId: r.person_id,
      jobReqId: r.job_requisition_id,
      jobReqTitle: one(r.job_requisitions)?.title ?? null,
      jobReqStatus: one(r.job_requisitions)?.status ?? null,
      stageName: one(r.application_stages)?.name ?? null,
      currentStageId: r.current_stage_id,
      status: r.status,
      rating: r.rating,
      // AI rating: family screen (Candidate Pool score) first, else the per-req screen.
      aiRating: r.metadata?.family_screen?.rating ?? r.ai_rating,
      rejectionReason: r.rejection_reason,
      appliedAt: r.applied_at,
      decidedAt: r.decided_at,
      resumeDocumentId: r.resume_document_id,
      archivedAt: r.archived_at,
    };
  });

  // Archived applications stay in the payload (so the client "Show archived"
  // toggle can surface them) but are excluded from the header count and KPIs,
  // which describe the live pipeline.
  const activeRows = rows.filter((r) => !r.archivedAt);

  return (
    <>
      <PageHead
        eyebrow="Talent"
        title="Applications"
        sub={`${activeRows.length.toLocaleString()} ${activeRows.length === 1 ? "application" : "applications"} to open job reqs`}
        action={
          <Link href="/admin/talent/applications/new" className="admin-btn admin-btn--primary admin-btn--sm">
            Add candidates
          </Link>
        }
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error}
        </div>
      )}

      <div className="admin-kpi-grid u-mb-5">
        <MetricCard label="Active" value={activeRows.filter((r) => r.status === "active").length} sub="in pipeline" />
        <MetricCard label="On hold" value={activeRows.filter((r) => r.status === "on_hold").length} sub="parked" />
        <MetricCard label="Hired" value={activeRows.filter((r) => r.status === "hired").length} sub="closed won" />
      </div>

      <ApplicationsView rows={rows} stageColumns={stageColumns} stageMap={stageMap} />
    </>
  );
}
