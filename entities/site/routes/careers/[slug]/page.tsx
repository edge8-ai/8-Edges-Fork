import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getActiveJobs } from '@/entities/site/lib/jobs'
import { BASE } from '@/entities/site/lib/public-routes'
import { BRAND, pageTitle } from '@/entities/site/lib/brand-name'

// The canonical, shareable URL for a single posting. Content is the same
// full_jd the index used to expand inline — this page is now the one place it
// renders, so /careers/ links here rather than duplicating it.

const EMPLOYMENT_SCHEMA: Record<string, string> = {
  'Full-time': 'FULL_TIME',
  'Part-time': 'PART_TIME',
  Contract: 'CONTRACTOR',
  Internship: 'INTERN',
  Temporary: 'TEMPORARY',
  Advisor: 'CONTRACTOR',
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const job = (await getActiveJobs()).find((j) => j.slug === params.slug)
  if (!job) return { title: pageTitle('Role not found', BRAND && `${BRAND} Careers`, !BRAND && 'Careers') }
  return {
    title: pageTitle(job.title, BRAND && `${BRAND} Careers`, !BRAND && 'Careers'),
    description: job.excerpt || `${job.title}${BRAND ? ` at ${BRAND}` : ''}. ${job.location}, ${job.type}.`,
    alternates: { canonical: `${BASE}/careers/${job.slug}/` },
    openGraph: {
      title: pageTitle(job.title, BRAND && `${BRAND} Careers`, !BRAND && 'Careers'),
      description: job.excerpt || `${job.title}${BRAND ? ` at ${BRAND}` : ''}. ${job.location}, ${job.type}.`,
      url: `${BASE}/careers/${job.slug}/`,
      type: 'article',
    },
  }
}

export default async function JobPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const job = (await getActiveJobs()).find((j) => j.slug === params.slug)
  if (!job) notFound()

  const applyHref = job.supabaseJobId
    ? `/careers/${job.slug}/apply/`
    : `mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`

  // Google Jobs reads this. Without it a posting is a plain article and never
  // surfaces in the jobs carousel.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.contentHtml,
    ...(job.posted ? { datePosted: job.posted } : {}),
    employmentType: EMPLOYMENT_SCHEMA[job.type] ?? 'FULL_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: BRAND,
      sameAs: BASE,
    },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.location },
    },
    directApply: Boolean(job.supabaseJobId),
  }

  return (
    <main className="site-apply-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="site-apply-hero">
        <div className="container">
          <Link href="/careers/" className="apply-back">← Back to careers</Link>
          <p className="site-apply-eyebrow">{job.department}</p>
          <h1 className="site-apply-title">{job.title}</h1>
          <div className="site-apply-meta">
            <span>{job.location}</span>
            <span className="apply-meta-sep">·</span>
            <span>{job.type}</span>
          </div>
          <div className="jd-hero-actions">
            {/* btn-secondary, not btn-primary: primary is var(--dark) and
                vanishes against this hero. Matches the careers hero CTA. */}
            <a href={applyHref} className="btn btn-secondary">Apply Now →</a>
          </div>
        </div>
      </section>

      <section className="jd-body-section">
        <div className="container jd-body-wrap">
          {job.excerpt && <p className="jd-lede">{job.excerpt}</p>}
          <div className="job-body" dangerouslySetInnerHTML={{ __html: job.contentHtml }} />
          <div className="jd-footer-cta">
            <h2>Interested?</h2>
            <p>Tell us why you&rsquo;re a fit. We read every application.</p>
            <a href={applyHref} className="btn btn-primary">Apply for {job.title} →</a>
          </div>
        </div>
      </section>
    </main>
  )
}
