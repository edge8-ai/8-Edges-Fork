import { describe, it, expect } from 'vitest'
import { ctaContentFor, tagHtmlLinks, utmCampaignFor, withUtm } from './marketing-email-utm'

describe('withUtm', () => {
  it('adds the four parameters and keeps existing ones', () => {
    const out = withUtm('https://www.example.com/post/x/?ref=1', '2026-09-09-letter', 'post-1')
    expect(out).toBe('https://www.example.com/post/x/?ref=1&utm_source=letter&utm_medium=email&utm_campaign=2026-09-09-letter&utm_content=post-1')
  })
  it('leaves hand-tagged, mailto and malformed links alone', () => {
    expect(withUtm('https://x.com/?utm_source=manual', 'c', 'p')).toBe('https://x.com/?utm_source=manual')
    expect(withUtm('mailto:dave@example.com', 'c', 'p')).toBe('mailto:dave@example.com')
    expect(withUtm('not a url', 'c', 'p')).toBe('not a url')
  })
})

describe('tagHtmlLinks', () => {
  it('tags every href in rendered HTML and re-escapes ampersands', () => {
    const html = '<p><a href="https://www.example.com/blog/?a=1&amp;b=2">blog</a> and <a href="mailto:x@y.z">mail</a></p>'
    const out = tagHtmlLinks(html, 'c', 'letter')
    expect(out).toContain('href="https://www.example.com/blog/?a=1&amp;b=2&amp;utm_source=letter&amp;utm_medium=email&amp;utm_campaign=c&amp;utm_content=letter"')
    expect(out).toContain('href="mailto:x@y.z"')
  })
})

describe('campaign and content names', () => {
  it('builds a dated slug from the subject and a cta slug from the label', () => {
    expect(utmCampaignFor({ subject: 'The model was fine. My process was not.', date: '2026-09-09T01:00:00Z' })).toBe('2026-09-09-the-model-was-fine-my-process-was-not')
    expect(ctaContentFor('Book a conversation')).toBe('cta-book-a-conversation')
  })
})
