import { describe, expect, it } from 'vitest'
import { allCaseStudies, getCaseStudyBySlug } from './caseStudies'
import { caseStudyStories } from './caseStudyStories'

// A.20: the index and the stories are two files that have to agree, and the
// compiler now holds one half of that agreement — `StorySlug` means a story
// study cannot name a story that is not there, and the story map cannot carry a
// key the union does not list. These cover the half types cannot: that the two
// collections line up one for one, and that nothing is stranded.
//
// Nothing here names a client. The fork overlay replaces BOTH modules with
// empty stubs, so every assertion below is written to hold over empty
// collections too, and this file carries nothing the mirror should not see.

describe('the case study index and the stories agree', () => {
  it('gives every story a study to be shown on', () => {
    const orphans = Object.keys(caseStudyStories).filter(
      (slug) => !allCaseStudies.some((cs) => cs.slug === slug),
    )
    expect(orphans).toEqual([])
  })

  it('hands each study the story filed under its own slug, never another', () => {
    for (const cs of allCaseStudies) {
      if (!cs.story) continue
      expect(cs.story).toBe(caseStudyStories[cs.slug as keyof typeof caseStudyStories])
    }
  })

  it('counts the same number of stories as studies carrying one', () => {
    // The assertion that would have caught a renamed key before the types did:
    // the study kept its slug and silently lost its body.
    expect(allCaseStudies.filter((cs) => cs.story).length).toBe(
      Object.keys(caseStudyStories).length,
    )
  })

  it('never carries a story-format study whose body went missing', () => {
    const empty = allCaseStudies.filter((cs) => 'story' in cs && cs.story === undefined)
    expect(empty).toEqual([])
  })

  it('finds every study by its own slug', () => {
    for (const cs of allCaseStudies) {
      expect(getCaseStudyBySlug(cs.slug)?.slug).toBe(cs.slug)
    }
  })
})
