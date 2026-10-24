import Link from 'next/link'
import JobCard from './JobCard'
import RevealObserver from '@/entities/site/ui/RevealObserver'
import { getActiveJobs } from '@/entities/site/lib/jobs'
import { SUPPORT_EMAIL } from '@/kernel/config/organisation'
import { BRAND } from '@/entities/site/lib/brand-name'

// The careers index.
//
// This file is an overlay for 8-Edges-Fork. It only replaces upstream while it
// sits at the SAME repo-relative path as the real page — today
// entities/site/routes/careers/page.tsx.
//
// Upstream's is a recruiting pitch — a headline, three paragraphs on what
// working there is like, and a section on why to join. Every line of it is a
// claim about one particular company, so substituting a name would not have
// made it true for a fork; it would have made it a fabrication with the fork's
// name on it.
//
// This page is the same feature without the pitch: the roles the operator has
// actually posted, from their own ATS, and a way to get in touch when there
// are none. Add the pitch above the listings when you have one to make.

export const dynamic = 'force-dynamic'

export default async function CareersPage() {
  const jobs = await getActiveJobs()

  return (
    <main>
      <RevealObserver />

      <section className="careers-hero">
        <div className="careers-hero-glow" />
        <div className="container">
          <div className="careers-hero-inner reveal">
            <span className="section-label site-chip--glass">Careers</span>
            <h1>{BRAND ? `Work with ${BRAND}` : 'Work with us'}</h1>
          </div>
        </div>
      </section>

      <section className="section section--tint" id="open-roles">
        <div className="container">
          <div className="careers-roles-header reveal">
            <div>
              <span className="section-label">Open Roles</span>
              <h2 className="section-title u-mt-3">
                {jobs.length > 0 ? 'Where you fit in' : 'No openings right now'}
              </h2>
            </div>
            {jobs.length > 0 && (
              <span className="job-count-badge">
                {jobs.length} open {jobs.length === 1 ? 'role' : 'roles'}
              </span>
            )}
          </div>

          {jobs.length > 0 ? (
            <div className="jobs-grid">
              {jobs.map((job) => (
                <JobCard key={job.slug} job={job} />
              ))}
            </div>
          ) : (
            <div className="careers-empty reveal">
              <p className="careers-empty-sub">
                Send us your background and we will get in touch when something fits.
              </p>
              {SUPPORT_EMAIL ? (
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=Expression of Interest`}
                  className="btn btn-primary"
                >
                  Express interest →
                </a>
              ) : (
                <Link href="/contact" className="btn btn-primary">
                  Get in touch →
                </Link>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
