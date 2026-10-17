import { getAllPublishedPosts } from '@/entities/campaigns'
import { allCaseStudies } from '@/entities/site/lib/caseStudies'
import {
  BASE,
  COMPANY,
  HAS_WORKFLOWS,
  INCLUDES_CASE_STUDIES,
  NAV_EXTRA,
  SERVICES,
  SITE_SUMMARY,
  SITE_SUMMARY_BODY,
  SITE_SUMMARY_HEADING,
  SOCIAL_LINKS,
} from '@/entities/site/lib/public-routes'
import { WORKFLOW_ENTRIES } from '@/entities/site/routes/workflow-entries'
import { ORG_NAME } from '@/kernel/config/organisation'
import { BRAND } from '@/entities/site/lib/brand-name'

// Served at /llms.txt — a curated, machine-readable map of the site for LLMs and
// AI search engines (the llms.txt convention: https://llmstxt.org).
// Generated from the same data as sitemap.ts so the article index never drifts.
// Page URLs keep the trailing slash to match trailingSlash:true and avoid 308 hops;
// /llms.txt itself has a file extension, so Next serves it without a trailing slash.

// The four offices the upstream groups AI work around. The article index
// mirrors that order.
const CATEGORY_ORDER = ['Revenue', 'Talent', 'Operations', 'Innovation'] as const

function link(path: string, name: string, desc?: string) {
  return `- [${name}](${BASE}${path})${desc ? `: ${desc}` : ''}`
}

export async function GET() {
  const allPosts = await getAllPublishedPosts()
  const lines: string[] = []

  // Heading and blurb from public-routes.ts, which the fork overlay replaces:
  // this is the one file on the site whose entire audience is machines reading
  // it as a statement of who the site belongs to.
  lines.push(`# ${SITE_SUMMARY_HEADING || ORG_NAME || ''}`.trimEnd())
  lines.push('')
  if (SITE_SUMMARY) {
    lines.push(`> ${SITE_SUMMARY}`)
    lines.push('')
  }
  if (SITE_SUMMARY_BODY) lines.push(SITE_SUMMARY_BODY)
  lines.push('')

  lines.push('## Services')
  for (const s of SERVICES) lines.push(link(s.path, s.name, s.desc))
  lines.push('')

  // The whole section, not just its entries: a heading advertising case
  // studies with nothing under it is its own kind of wrong, and the index page
  // it links to is internal.
  if (INCLUDES_CASE_STUDIES) {
    lines.push('## Case Studies — AI Programs')
    for (const l of NAV_EXTRA) lines.push(link(l.path.endsWith('/') ? l.path : `${l.path}/`, l.name, l.desc))
    for (const cs of allCaseStudies) {
      lines.push(`- [${cs.title}](${BASE}/case-studies/${cs.slug}/): ${cs.subtitle}`)
    }
    lines.push('')
  }

  lines.push('## Company')
  for (const c of COMPANY) lines.push(link(c.path, c.name, c.desc))
  lines.push('')

  // The whole section is conditional: entities/library is internal, so a fork
  // has none of these pages and this file is read by crawlers that will try
  // every link in it.
  if (HAS_WORKFLOWS) {
    lines.push('## Workflows')
    lines.push(
      link('/workflows/', 'Workflows', `The operating workflows ${BRAND} runs on, documented end to end.`),
    )
    lines.push(
      link(
        '/workflows/method/',
        'How We Design Workflows',
        `The ${BRAND} method: 5D program brief, seven workflow elements, the Centaur Map, the New Hire Test, and three stage gates.`
      )
    )
    for (const w of WORKFLOW_ENTRIES) {
      lines.push(`- [${w.name}](${BASE}${w.path}): ${w.desc}`)
    }
    lines.push('')
  }

  for (const cat of CATEGORY_ORDER) {
    const posts = allPosts.filter((p) => p.category === cat)
    if (posts.length === 0) continue
    lines.push(`## Articles: ${cat}`)
    for (const p of posts) lines.push(`- [${p.title}](${BASE}/post/${p.slug}/)`)
    lines.push('')
  }

  lines.push('## Optional')
  lines.push(link('/sitemap.xml', 'Sitemap', 'Complete list of all indexed URLs.'))
  for (const l of SOCIAL_LINKS) lines.push(`- [${l.name}](${l.path})${l.desc ? `: ${l.desc}` : ''}`)
  lines.push('')

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
