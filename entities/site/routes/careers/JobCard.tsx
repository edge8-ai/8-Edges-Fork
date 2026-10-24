import Link from 'next/link'

type Job = {
  slug: string
  title: string
  department: string
  location: string
  type: string
  excerpt: string
  applyEmail: string
  supabaseJobId: string | null
  featured: boolean
  contentHtml: string
}

export default function JobCard({ job }: { job: Job }) {
  const deptSlug = job.department
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  const applyHref = job.supabaseJobId
    ? `/careers/${job.slug}/apply/`
    : `mailto:${job.applyEmail}?subject=${encodeURIComponent(`Application: ${job.title}`)}`

  return (
    <div className={`job-card reveal${job.featured ? ' featured' : ''}`}>
      <div className="job-card-tags">
        <span className={`job-dept dept-${deptSlug}`}>{job.department}</span>
        {job.featured && <span className="job-badge-featured">Featured</span>}
      </div>

      <h3 className="job-title">
        <Link href={`/careers/${job.slug}/`}>{job.title}</Link>
      </h3>

      <div className="job-meta">
        <span className="job-meta-item">{job.location}</span>
        <span className="job-meta-sep">·</span>
        <span className="job-meta-item">{job.type}</span>
      </div>

      <p className="job-excerpt">{job.excerpt}</p>

      <div className="job-card-actions">
        <Link href={`/careers/${job.slug}/`} className="btn btn-outline job-toggle-btn">
          View Role Details
        </Link>
        <a href={applyHref} className="btn btn-primary job-apply-btn">
          Apply Now →
        </a>
      </div>
    </div>
  )
}
