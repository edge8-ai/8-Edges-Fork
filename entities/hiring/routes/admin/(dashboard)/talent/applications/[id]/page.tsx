import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { getCandidateSensitive } from "@/entities/hiring/lib/candidate-sensitive";
import { PageHead } from "@/kernel/ui/PageHead";
import { listAssignablePeople, listPeopleNames, type PersonOption } from "@/entities/crm";
import { appSlug, isShortCode, isUuid, shortCodeRange, shortOf } from "@/kernel/config/slug";
import { stageEnteredAt as readStageEnteredAt } from "@/entities/hiring/lib/ats/stage-log";
import { ApplicationManage, type AppManageData } from "../ApplicationManage";
import { applicationChainView, type ApplicationChainView } from "@/entities/hiring/lib/chain/view";
import { mayProp } from "@/kernel/identity/may-prop";
import { one } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Same data-cache pin as the list — a stale read here would show an old stage or
// a restored/archived state that no longer matches the DB.
// Full-page applicant profile. Unlike the list, this fetches one application by
// id with no open-req filter, so a shared link resolves even when the req has
// been closed or filled. Replaces the old side-drawer as the canonical,
// shareable place to manage an application.
type Cp = {
  headline: string | null;
  current_title: string | null;
  portfolio_url: string | null;
  do_not_hire: boolean;
  pool_status: string | null;
  english_proficiency: string | null;
  notice_period: string | null;
};
type P = NamedPerson & {
  email: string;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  candidate_profile: Cp | Cp[] | null;
};
type Jr = { title: string | null };
type St = { name: string | null };
type RawApp = {
  id: string;
  status: string | null;
  rating: number | null;
  rejection_reason: string | null;
  applied_at: string | null;
  decided_at: string | null;
  source: string | null;
  source_detail: string | null;
  referrer_person_id: string | null;
  current_stage_id: string | null;
  resume_document_id: string | null;
  job_requisition_id: string | null;
  person_id: string | null;
  archived_at: string | null;
  hr_assessment: string | null;
  people: P | P[] | null;
  job_requisitions: Jr | Jr[] | null;
  application_stages: St | St[] | null;
};

type PeopleName = NamedPerson;
type RefRow = { id: string; people: PeopleName | PeopleName[] | null };

type AppRef = {
  id: string;
  name: string | null;
  canonical: string;
  redirect: "permanent" | "temporary" | null;
};

// Three outcomes, kept distinct on purpose: a DB error must not masquerade as a
// missing row. The original page showed a retryable error alert for a query error
// and a 404 only for a genuinely absent row; the resolver preserves that split so
// a transient timeout doesn't tell the recruiter the application was deleted.
type AppRefResult =
  | { kind: "ok"; ref: AppRef }
  | { kind: "error"; message: string }
  | { kind: "notfound" };

// Resolve a URL segment — a name+short-code slug like "nguyen-thi-mai-a7dfed24",
// or a legacy full uuid — to the application row. Wrapped in cache() so
// generateMetadata and the page body share one DB round-trip per request.
const resolveApplicationRef = cache(async (segment: string): Promise<AppRefResult> => {
  const nameOf = (row: RefRow) => {
    const p = one(row.people);
    return personName(p, null);
  };

  // Legacy full-uuid link: resolve exactly, then send it on to the canonical slug.
  if (isUuid(segment)) {
    const { data, error } = await companyOs.from("applications").select(`id, people!person_id(${NAME_COLUMNS})`)
      .eq("id", segment)
      .maybeSingle();
    if (error) return { kind: "error", message: error.message };
    const row = data as unknown as RefRow | null;
    if (!row) return { kind: "notfound" };
    const name = nameOf(row);
    return { kind: "ok", ref: { id: row.id, name, canonical: appSlug(name, row.id), redirect: "permanent" } };
  }

  // Slug: the trailing hyphen group is the 8-hex short code. PostgREST can't ILIKE
  // a uuid column, so match the code with an index-friendly uuid range instead.
  const short = shortOf(segment);
  if (!isShortCode(short)) return { kind: "notfound" };
  const { lo, hi } = shortCodeRange(short);
  const { data, error } = await companyOs.from("applications").select(`id, people!person_id(${NAME_COLUMNS})`)
    .gte("id", lo)
    .lte("id", hi)
    .limit(2);
  if (error) return { kind: "error", message: error.message };
  const rows = (data as unknown as RefRow[] | null) ?? [];
  if (rows.length === 0) return { kind: "notfound" };

  let row = rows[0];
  if (rows.length > 1) {
    // Astronomically rare 32-bit collision: keep only the row whose canonical slug
    // is exactly what was requested; if none, we can't safely disambiguate.
    const exact = rows.find((r) => appSlug(nameOf(r), r.id) === segment);
    if (!exact) return { kind: "notfound" };
    row = exact;
  }
  const name = nameOf(row);
  const canonical = appSlug(name, row.id);
  return { kind: "ok", ref: { id: row.id, name, canonical, redirect: segment === canonical ? null : "temporary" } };
});

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const resolved = await resolveApplicationRef(params.id);
  return { title: resolved.kind === "ok" ? resolved.ref.name ?? "Candidate" : "Candidate" };
}

export default async function ApplicationDetailPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("hiring.ats");
  const params = await props.params;
  const resolved = await resolveApplicationRef(params.id);
  if (resolved.kind === "error") {
    return (
      <>
        <PageHead eyebrow={<Link href="/admin/talent/applications">← Applications</Link>} title="Application" />
        <div className="admin-alert admin-alert--err">{resolved.message}</div>
      </>
    );
  }
  if (resolved.kind === "notfound") notFound();
  const ref = resolved.ref;
  // A legacy uuid link is permanently canonicalized; a stale-name slug (the
  // candidate was renamed) redirects temporarily, since the name can change again.
  if (ref.redirect === "permanent") permanentRedirect(`/admin/talent/applications/${ref.canonical}`);
  if (ref.redirect === "temporary") redirect(`/admin/talent/applications/${ref.canonical}`);

  const { data, error } = await companyOs.from("applications").select(
      `id, status, rating, rejection_reason, applied_at, decided_at, source, source_detail, referrer_person_id, current_stage_id, resume_document_id, job_requisition_id, person_id, archived_at, hr_assessment, people!person_id(${NAME_COLUMNS}, phone, city, country, linkedin_url, candidate_profile(headline, current_title, portfolio_url, do_not_hire, pool_status, english_proficiency, notice_period)), job_requisitions(title), application_stages(name)`,
    )
    .eq("id", ref.id)
    .maybeSingle();

  if (error) {
    return (
      <>
        <PageHead eyebrow={<Link href="/admin/talent/applications">← Applications</Link>} title="Application" />
        <div className="admin-alert admin-alert--err">{error.message}</div>
      </>
    );
  }
  if (!data) notFound();

  const r = data as unknown as RawApp;
  const p = one(r.people);
  const cp = one(p?.candidate_profile ?? null);
  const candidateName = personName(p, null);

  // Candidate salary is people.pay, which Super Admin holds by declaration
  // (ADR 0014). It lives on the restricted candidate_sensitive store, fetched
  // ONLY when the viewer holds it; everyone else never receives the figures.
  const canViewSalary = access.may("people.pay");
  const salary = canViewSalary && r.person_id ? await getCandidateSensitive(r.person_id) : null;

  // Referrer picker: assignable team members (the usual referrers), plus the
  // current referrer if it happens to be someone no longer assignable, so the
  // stored value still renders and stays selectable.
  const referrerOptions: PersonOption[] = await listAssignablePeople();
  if (r.referrer_person_id && !referrerOptions.some((o) => o.id === r.referrer_person_id)) {
    const names = await listPeopleNames([r.referrer_person_id]);
    const name = names.get(r.referrer_person_id);
    if (name) referrerOptions.unshift({ id: r.referrer_person_id, name });
  }

  const app: AppManageData = {
    id: r.id,
    jobReqId: r.job_requisition_id,
    personId: r.person_id,
    jobReqTitle: one(r.job_requisitions)?.title ?? null,
    candidateName,
    status: r.status,
    rating: r.rating,
    rejectionReason: r.rejection_reason,
    currentStageId: r.current_stage_id,
    currentStageName: one(r.application_stages)?.name ?? null,
    appliedAt: r.applied_at,
    decidedAt: r.decided_at,
    source: r.source,
    sourceDetail: r.source_detail,
    referrerId: r.referrer_person_id,
    resumeDocumentId: r.resume_document_id,
    email: p?.email ?? null,
    phone: p?.phone ?? null,
    city: p?.city ?? null,
    country: p?.country ?? null,
    headline: cp?.headline ?? null,
    currentTitle: cp?.current_title ?? null,
    linkedinUrl: p?.linkedin_url ?? null,
    portfolioUrl: cp?.portfolio_url ?? null,
    doNotHire: Boolean(cp?.do_not_hire),
    poolStatus: cp?.pool_status ?? null,
    hrAssessment: r.hr_assessment,
    englishProficiency: cp?.english_proficiency ?? null,
    canViewSalary,
    salaryExpectationCents: salary?.salary_expectation_cents ?? null,
    salaryExpectationCurrency: salary?.salary_expectation_currency ?? null,
    aiSalary: salary?.ai_salary_expectation ?? null,
    noticePeriod: cp?.notice_period ?? null,
  };

  // When the candidate entered the current stage (drives the pipeline strip's
  // days-in-stage). Null for applications that predate stage logging.
  const enteredAt = r.current_stage_id ? await readStageEnteredAt(r.id, r.current_stage_id) : null;

  // The hiring chain (Z.9): the messages and the decision. A failed read shows
  // as a failure, never as an application with nothing waiting.
  let chain: ApplicationChainView | null = null;
  let chainError: string | null = null;
  try {
    chain = await applicationChainView(r.id, access.personId);
  } catch (err) {
    chainError = err instanceof Error ? err.message : String(err);
  }

  return (
    <ApplicationManage
      app={app}
      referrerOptions={referrerOptions}
      archived={Boolean(r.archived_at)}
      stageEnteredAt={enteredAt}
      chain={chain}
      chainError={chainError}
      may={mayProp(access, ["hiring.ats", "hiring.approve"])}
    />
  );
}
