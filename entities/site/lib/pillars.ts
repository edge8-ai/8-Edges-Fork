import type { PostMeta } from '@/entities/site/lib/postData'

// Content pillars on the public blog. A pillar is the argument a post makes
// (Build with AI, Data first); the category is the office it is for. Pillars
// live in company_os.marketing_pillars and reach the site as a name on each
// post; this file is pure so the hub page's grouping can be tested without a
// database. Client-safe: no fs, no supabase.

export type Pillar = { slug: string; name: string; count: number; thesis: string | null }

// One sentence per pillar, shown under the hub title. marketing_pillars has no
// description column, so the thesis lives here, keyed by the derived slug; a
// pillar without one renders the list alone.
export const PILLAR_THESES: Record<string, string> = {
  'build-with-ai':
    'One operator directing AI ships what used to take a team. Case studies with the token bill attached: what it cost, what the humans did, and what to hire for next.',
  'lead-with-ai':
    'The non-technical half of AI leadership: the goal, the guardrails, the definition of done and the budget. How founders delegate real work to models and keep judgment where it belongs.',
  'data-first':
    'AI problems are usually data problems. Centralize the record for personalization, not for dashboards, and audit what you have before you hire anyone to build on it.',
  'revenue-with-ai':
    'Sales, marketing, search and brand, done with agents: what changes in how customers find you, how you sell, and how a small team runs a full campaign.',
  'ai-market-signals':
    'What a model launch or a platform move means for a founder, read from Vietnam and written for people who have to decide something this quarter.',
}

// Unique pillars across the posts, most published first, then by name so the
// order is stable when counts tie. Posts without a pillar contribute nothing.
export function pillarsFrom(posts: Pick<PostMeta, 'pillar' | 'pillarSlug'>[]): Pillar[] {
  const counts = new Map<string, Pillar>()
  for (const p of posts) {
    if (!p.pillar || !p.pillarSlug) continue
    const hit = counts.get(p.pillarSlug)
    if (hit) hit.count += 1
    else counts.set(p.pillarSlug, { slug: p.pillarSlug, name: p.pillar, count: 1, thesis: PILLAR_THESES[p.pillarSlug] ?? null })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
