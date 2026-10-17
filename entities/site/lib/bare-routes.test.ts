import { describe, expect, it } from 'vitest'
import { isBareRoute } from './bare-routes'

// Which pages lose the site nav and footer (SiteFrame).
describe('isBareRoute', () => {
  it('keeps the existing standalone surfaces bare', () => {
    for (const p of ['/admin', '/admin/crm', '/team/', '/portal/x', '/reserve/saigon-private/', '/surveys/onboarding/']) {
      expect(isBareRoute(p)).toBe(true)
    }
  })

  it('makes the link-opened event, ticket and work pages bare (M5.5)', () => {
    expect(isBareRoute('/events/arca-2026/')).toBe(true)
    expect(isBareRoute('/t/ABC123/')).toBe(true)
    expect(isBareRoute('/work/tok_1/')).toBe(true)
  })

  it('matches whole segments, so marketing pages that share a prefix keep the nav', () => {
    for (const p of ['/the-stack/', '/the-vietnam-experience/', '/training-and-certification/', '/workflows/', '/eventsx', '/', '/careers/']) {
      expect(isBareRoute(p)).toBe(false)
    }
    expect(isBareRoute(null)).toBe(false)
  })
})
