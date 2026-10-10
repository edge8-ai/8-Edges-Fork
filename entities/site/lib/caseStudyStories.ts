// Case study stories: the long-form half of a case study, keyed by slug.
//
// This file is an overlay stub for 8-Edges-Fork. Upstream it holds named
// clients, their numbers and their words; it only neutralises that while it
// sits at the SAME repo-relative path as the real module, today
// entities/site/lib/caseStudyStories.ts. Emptying the data is what removes it
// from the fork's bundle; hiding the pages would not.
//
// The interface is copied verbatim so the callers compile unchanged; the fork
// build in CI is what catches it drifting.
export interface CaseStudyStory {
  headline: string
  status?: string
  stats: { value: string; short: string; label: string }[]
  facts: { label: string; value: string }[]
  situation: string[]
  education?: { title: string; body: string; stats: { value: string; label: string }[] }
  built: { title: string; body: string }[]
  changed: string[]
  steal: { title: string; body: string }[]
  quotes?: { text: string; by: string; after: 'situation' | 'changed' }[]
  video?: { youtubeId: string; title: string; caption: string }
  portrait?: { src: string; alt: string; caption: string }
  photos?: { src: string; alt: string; caption: string }[]
  reading?: { title: string; href: string }[]
  next: { text: string; label: string; href: string }
}

export const caseStudyStories: Record<string, CaseStudyStory> = {};
