import type { MetadataRoute } from 'next'
import { allCaseStudies } from '@/entities/site/lib/caseStudies'
import { getActiveJobs } from '@/entities/site/lib/jobs'
import { getAllPublishedPosts, getPillars } from '@/entities/campaigns'
import { BASE, INCLUDES_CASE_STUDIES, STATIC_ROUTES } from '@/entities/site/lib/public-routes'
import { WORKFLOW_ENTRIES } from '@/entities/site/routes/workflow-entries'

// Site uses trailingSlash: true in next.config.mjs, so every canonical URL
// must end in '/'. Without this, Google does a 308 hop on every URL and
// burns crawl budget.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes = STATIC_ROUTES

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map(({ path, priority, changeFrequency }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))

  const caseStudyEntries: MetadataRoute.Sitemap = (INCLUDES_CASE_STUDIES ? allCaseStudies : []).map((cs) => ({
    url: `${BASE}/case-studies/${cs.slug}/`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  // Static + DB-published posts. getAllPublishedPosts degrades to static-only on
  // a DB read failure, so the sitemap never fails the build.
  const postEntries: MetadataRoute.Sitemap = (await getAllPublishedPosts()).map((p) => ({
    url: `${BASE}/post/${p.slug}/`,
    lastModified: p.date ? new Date(p.date) : now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  // One hub per content pillar with published posts; derived from the same
  // cached list, so it degrades the same way.
  const pillarEntries: MetadataRoute.Sitemap = (await getPillars()).map((p) => ({
    url: `${BASE}/blog/${p.slug}/`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  const workflowEntries: MetadataRoute.Sitemap = WORKFLOW_ENTRIES.map((w) => ({
    url: `${BASE}${w.path}`,
    lastModified: new Date(w.date),
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  // Postings live in the ATS, so this list changes without a deploy.
  // getActiveJobs() returns [] on a read failure — the sitemap degrades to the
  // static routes rather than failing the build.
  const jobEntries: MetadataRoute.Sitemap = (await getActiveJobs()).map((j) => ({
    url: `${BASE}/careers/${j.slug}/`,
    lastModified: j.posted ? new Date(j.posted) : now,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticEntries, ...caseStudyEntries, ...pillarEntries, ...postEntries, ...workflowEntries, ...jobEntries]
}
