// This file contains ONLY the static data - safe to use in client components
export interface PostMeta {
  slug: string
  title: string
  date: string
  category: string
  categorySlug: string
  image: string
  readTime: string
  tags: string[]
  mdFile: string
  excerpt: string
  // The content pillar (marketing_pillars) the post argues for: the promise,
  // where category is the office it is for. Optional because legacy rows and
  // static posts may carry none.
  pillar?: string
  pillarSlug?: string
}

// All 29 blog posts - static data only, no fs imports

export const categories = [
  { slug: 'revenue',    label: 'Revenue' },
  { slug: 'talent',     label: 'Talent' },
  { slug: 'operations', label: 'Operations' },
  { slug: 'innovation', label: 'Innovation' },
  { slug: 'claude',     label: 'Claude' },
]
