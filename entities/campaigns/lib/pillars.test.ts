import { describe, it, expect } from 'vitest'
import { pillarsFrom, PILLAR_THESES } from './pillars'

describe('pillarsFrom', () => {
  it('groups posts by pillar, counts them, and orders by count then name', () => {
    const posts = [
      { pillar: 'Data first', pillarSlug: 'data-first' },
      { pillar: 'Build with AI', pillarSlug: 'build-with-ai' },
      { pillar: 'Build with AI', pillarSlug: 'build-with-ai' },
      { pillar: 'AI market signals', pillarSlug: 'ai-market-signals' },
    ]
    expect(pillarsFrom(posts).map((p) => [p.slug, p.count])).toEqual([
      ['build-with-ai', 2],
      ['ai-market-signals', 1],
      ['data-first', 1],
    ])
  })

  it('skips posts without a pillar and attaches the thesis when one exists', () => {
    const pillars = pillarsFrom([{}, { pillar: 'Build with AI', pillarSlug: 'build-with-ai' }, { pillar: 'New idea', pillarSlug: 'new-idea' }])
    expect(pillars).toHaveLength(2)
    expect(pillars.find((p) => p.slug === 'build-with-ai')?.thesis).toBe(PILLAR_THESES['build-with-ai'])
    expect(pillars.find((p) => p.slug === 'new-idea')?.thesis).toBeNull()
  })
})
