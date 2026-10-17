// Case studies: named clients, their problems and their numbers.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real module — today
// entities/site/lib/caseStudies.ts.
//
// Fork note: INCLUDES_CASE_STUDIES already stopped the pages RENDERING, and
// that was not enough. A flag hides output; the module is still imported, so
// every client name, quote and result stayed in the fork's page.js and in a
// client chunk, readable by anyone who opened the bundle. Emptying the data
// is the only thing that removes it.
//
// The interface and the four accessors are copied verbatim so the callers
// compile unchanged; the fork build in CI is what catches them drifting.
import type { CaseStudyStory } from '@/entities/site/lib/caseStudyStories'

export interface CaseStudyMeta {
  slug: string
  title: string
  subtitle: string
  category: 'ai-programs'
  image?: string
  highlights: string[]
  description: string
  summary: string
  challenge: string[]
  approach: string[]
  result: string[]
  detailImages: string[]
  beforeAfter?: boolean
  website?: string
  websiteLabel?: string
  blogLink?: string
  story?: CaseStudyStory
  reading?: { title: string; href: string }[]
}

export const allCaseStudies: CaseStudyMeta[] = [];

export function getCaseStudyBySlug(slug: string): CaseStudyMeta | undefined {
  return allCaseStudies.find((cs) => cs.slug === slug)
}

export function getCaseStudiesByCategory(
  category: CaseStudyMeta['category']
): CaseStudyMeta[] {
  return allCaseStudies.filter((cs) => cs.category === category)
}

export function getAllCaseStudySlugs(): string[] {
  return allCaseStudies.map((cs) => cs.slug)
}
