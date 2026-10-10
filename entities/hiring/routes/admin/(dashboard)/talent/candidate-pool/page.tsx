import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { ROLE_FAMILIES, type FamilyScreen } from "@/entities/team";
import { RankTable, type RankRow } from "./RankTable";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { proposeHrefs } from "@/entities/hiring/lib/chain/view";

// Data cache can freeze Supabase reads despite force-dynamic — see applications/page.tsx.
export const metadata = {
  title: "Candidate Pool",
  description: "Every candidate who has ever applied, stack-ranked by AI screen.",
};

// Candidate Pool: every application ever, across all reqs. The All tab shows
// one row per person (best AI screen wins); the family tabs rank candidates
// whose req is tagged with a role_family against that family's ideal profile
// (applications.metadata.family_screen), so scores compare across reqs.
type P = NamedPerson & { id: string; email: string; phone: string | null; linkedin_url: string | null };
type Jr = { title: string | null; metadata: { role_family?: string } | null };
type RawApp = {
  id: string;
  status: string | null;
  rating: number | null;
  ai_rating: number | null;
  ai_summary: { overview?: string; skills?: string[] } | null;
  applied_at: string | null;
  resume_document_id: string | null;
  chain_step: string | null;
  person_id: string | null;
  metadata: { family_screen?: FamilyScreen; recruiter_note?: string } | null;
  people: P | P[] | null;
  job_requisitions: Jr | Jr[] | null;
};

// Recruiter notes from the ATS import often carry "Rating: 8.5/10" or "4/5".
function recruiterRating(note: string | undefined): string | null {
  const m = note?.match(/Rating:\s*([\d.]+)\s*\/\s*(5|10)/i);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

export default async function CandidatePoolPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("hiring.ats");
  const { data, error } = await companyOs.from("applications").select(
      `id, status, rating, ai_rating, ai_summary, applied_at, resume_document_id, chain_step, person_id, metadata, people!person_id(id, ${NAME_COLUMNS}, phone, linkedin_url), job_requisitions(title, metadata)`,
    )
    .limit(2000);

  const raw = (data ?? []) as unknown as RawApp[];
  // Hired and Rejected are proposed for an application in a live hiring chain (Z.9).
  const proposeAt = await proposeHrefs(raw.map((r) => ({ id: r.id, chainStep: r.chain_step })));

  // Best-screened application per (family, person) for the family tabs, and
  // one row per person for the All tab (best AI screen across families wins).
  const best = new Map<string, RankRow>();
  const pool = new Map<string, RankRow>();

  const merge = (prev: RankRow, next: RankRow): RankRow => {
    const keep = (next.rating ?? -1) > (prev.rating ?? -1) ? next : prev;
    const other = keep === prev ? next : prev;
    keep.reqTitles = [...new Set([...prev.reqTitles, ...next.reqTitles])];
    // A hire anywhere wins the status badge; a recruiter rating anywhere sticks.
    if (prev.status === "hired" || next.status === "hired") keep.status = "hired";
    keep.recruiterStars = keep.recruiterStars ?? other.recruiterStars;
    return keep;
  };

  for (const r of raw) {
    const p = one(r.people);
    if (!p) continue;
    const req = one(r.job_requisitions);
    const family = req?.metadata?.role_family ?? null;
    // The stored screen only counts when it was run for this row's family.
    const screen = r.metadata?.family_screen;
    const familyScreen = family != null && screen && screen.family === family ? screen : null;
    const row: RankRow = {
      applicationId: r.id,
      personId: p.id,
      family,
      name: personName(p),
      email: p.email.startsWith("no-email+") ? null : p.email,
      phone: p.phone,
      linkedinUrl: p.linkedin_url,
      reqTitle: req?.title?.trim() ?? null,
      reqTitles: [req?.title?.trim() ?? ""].filter(Boolean),
      status: r.status,
      appliedAt: r.applied_at,
      resumeDocumentId: r.resume_document_id,
      recruiterStars: r.rating,
      rating: familyScreen ? familyScreen.rating : null,
      overview: familyScreen ? familyScreen.overview : null,
      strengths: familyScreen ? familyScreen.strengths : [],
      gaps: familyScreen ? familyScreen.gaps : [],
      screenSource: familyScreen ? ("family" as const) : null,
      recruiterRating: recruiterRating(r.metadata?.recruiter_note),
      proposeHref: proposeAt.get(r.id) ?? null,
    };

    if (family) {
      const key = `${family}:${p.id}`;
      const prev = best.get(key);
      best.set(key, prev ? merge(prev, { ...row }) : { ...row });
    }

    // Pool row: no family screen for this app? Fall back to the per-req AI
    // screen (score AND notes) so as many candidates as possible carry both —
    // showing a rating with "Not yet AI-screened" underneath reads as a bug.
    const poolRow: RankRow = { ...row, rating: row.rating ?? r.ai_rating };
    if (!poolRow.overview && r.ai_summary?.overview) {
      poolRow.overview = r.ai_summary.overview;
      poolRow.strengths = Array.isArray(r.ai_summary.skills) ? r.ai_summary.skills : [];
      poolRow.screenSource = "app";
    }
    const prev = pool.get(p.id);
    pool.set(p.id, prev ? merge(prev, poolRow) : poolRow);
  }

  const byRating = (a: RankRow, b: RankRow) => (b.rating ?? -1) - (a.rating ?? -1);
  const rows = [...best.values()].sort(byRating);
  const poolRows = [...pool.values()].sort(byRating);
  const screened = poolRows.filter((r) => r.rating != null).length;

  return (
    <>
      <PageHead
        eyebrow="Talent"
        title="Candidate Pool"
        sub={`${poolRows.length} candidates · ${screened} AI-screened · ${ROLE_FAMILIES.length} role families`}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error.message}
        </div>
      )}
      <RankTable
        rows={rows}
        poolRows={poolRows}
        families={ROLE_FAMILIES.map((f) => ({ key: f.key, label: f.label }))}
      />
    </>
  );
}
