import Link from 'next/link'
import { selectJobRequisitions } from '@/entities/hiring'
import { notFound } from 'next/navigation'
import { getActiveJobs } from '@/entities/site/lib/jobs'
import { companyOs } from '@/kernel/data/supabase'
import ApplyForm from './ApplyForm'
import { BRAND, pageTitle } from '@/entities/site/lib/brand-name'

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const jobs = await getActiveJobs()
  const job = jobs.find((j) => j.slug === params.slug)
  return {
    title: job ? pageTitle(`Apply: ${job.title}`, BRAND && `${BRAND} Careers`, !BRAND && 'Careers') : pageTitle('Apply', BRAND && `${BRAND} Careers`, !BRAND && 'Careers'),
  }
}

export default async function ApplyPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const jobs = await getActiveJobs()
  const job = jobs.find((j) => j.slug === params.slug)
  if (!job || !job.supabaseJobId) notFound()

  // Per-role screening questions (up to 3) live on the job requisition.
  const { data: reqRow, error: reqRowError } = await selectJobRequisitions('application_questions')
    .eq('id', job.supabaseJobId)
    .maybeSingle()
  if (reqRowError) console.error('[site] job_requisitions read failed:', reqRowError.message)
  const questions: string[] = Array.isArray(reqRow?.application_questions)
    ? (reqRow.application_questions as unknown[]).filter((q): q is string => typeof q === 'string').slice(0, 3)
    : []

  return (
    <main className="site-apply-page">
      <section className="site-apply-hero">
        <div className="container">
          <Link href="/careers/" className="apply-back">← Back to careers</Link>
          <p className="site-apply-eyebrow">Apply for this role</p>
          <h1 className="site-apply-title">{job.title}</h1>
          <div className="site-apply-meta">
            <span>{job.department}</span>
            <span className="apply-meta-sep">·</span>
            <span>{job.location}</span>
            <span className="apply-meta-sep">·</span>
            <span>{job.type}</span>
          </div>
        </div>
      </section>

      <section className="site-apply-form-section">
        <div className="container site-apply-form-wrap">
          <ApplyForm
            jobId={job.supabaseJobId}
            jobTitle={job.title}
            jobSlug={job.slug}
            questions={questions}
          />
        </div>
      </section>
    </main>
  )
}

