import { remark } from 'remark'
import { selectJobRequisitions } from '@/entities/hiring'
import remarkHtml from 'remark-html'
import { unstable_noStore as noStore } from 'next/cache'
import { companyOs } from '@/kernel/data/supabase'
import { OPS_EMAIL } from "@/kernel/config/contacts";

// Public job postings, sourced from the ATS (company_os.job_requisitions).
// A role is live on /careers iff status = 'open' AND is_public. Content is the
// req's full_jd markdown; presentation extras (department label, excerpt,
// featured) ride in metadata. Publishing is managed from the admin job req
// page — no code change needed to post or unpost a role.

export type JobPost = {
  slug: string
  title: string
  department: string
  location: string
  type: string
  posted: string
  excerpt: string
  applyEmail: string
  supabaseJobId: string | null
  featured: boolean
  active: boolean
  contentHtml: string
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  intern: 'Internship',
  temp: 'Temporary',
  advisor: 'Advisor',
}

type ReqRow = {
  id: string
  slug: string | null
  title: string
  employment_type: string
  location: string | null
  opened_at: string | null
  full_jd: string | null
  description: string | null
  metadata: Record<string, unknown> | null
}

export async function getActiveJobs(): Promise<JobPost[]> {
  // The Supabase client's internal fetch() calls are made from a module-scope
  // singleton (kernel/data/supabase), which can slip past force-dynamic's cache
  // detection and get stuck in Vercel's persistent Data Cache across
  // deployments. noStore() explicitly opts this data fetch out — the fix
  // Next.js docs prescribe for non-fetch-based/third-party data sources.
  noStore()

  const { data, error } = await selectJobRequisitions('id, slug, title, employment_type, location, opened_at, full_jd, description, metadata')
    .eq('status', 'open')
    .eq('is_public', true)
    .order('opened_at', { ascending: false })
  if (error) {
    console.error('[jobs] job_requisitions read failed:', error.message)
    return []
  }

  const jobs = await Promise.all(
    ((data ?? []) as ReqRow[]).map(async (r) => {
      const meta = r.metadata ?? {}
      const markdown = r.full_jd || r.description || ''
      const processed = await remark().use(remarkHtml).process(markdown)
      return {
        slug: r.slug ?? r.id,
        title: r.title,
        department: typeof meta.department === 'string' && meta.department ? meta.department : 'General',
        location: r.location ?? 'Remote',
        type: EMPLOYMENT_LABEL[r.employment_type] ?? 'Full-time',
        posted: r.opened_at ?? '',
        excerpt: typeof meta.excerpt === 'string' ? meta.excerpt : '',
        applyEmail: OPS_EMAIL,
        supabaseJobId: r.id,
        featured: meta.featured === true,
        active: true,
        contentHtml: processed.toString(),
      } as JobPost
    }),
  )

  return jobs.sort((a, b) => {
    if (a.featured && !b.featured) return -1
    if (!a.featured && b.featured) return 1
    return new Date(b.posted).getTime() - new Date(a.posted).getTime()
  })
}
