import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

// The module reads RESEND_API_KEY and constructs a Resend client at import
// time, and pulls in the interactions writer, which reaches Supabase. Neither
// matters here: this file covers the two pure pieces — the markdown subset
// that renders into a campaign, and the signed unsubscribe token.
//
// UNSUBSCRIBE_SECRET is read per call rather than at import, so it is set
// before the dynamic import and can be cleared mid-file to cover the
// unconfigured case.
vi.mock('@/kernel/messaging/writes', () => ({ insertInteractions: vi.fn() }))
vi.mock('resend', () => ({ Resend: class {} }))

process.env.UNSUBSCRIBE_SECRET = 'test-secret-not-a-real-one'

const { renderMarkdown, unsubscribeToken, verifyUnsubscribeToken } = await import('./marketing-email')

describe('renderMarkdown — escaping', () => {
  it('escapes the HTML metacharacters before any markdown is applied', () => {
    const html = renderMarkdown('a < b & c > d')
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
    expect(html).toContain('&amp;')
    expect(html).not.toContain('a < b')
  })

  it('renders a single line break as a real break, not as escaped text', () => {
    // 2026-09-26: a "best\nDave" sign-off went out reading "best<br />Dave".
    const html = renderMarkdown('best\nDave')
    expect(html).toContain('best<br />Dave')
    expect(html).not.toContain('&lt;br')
  })

  it('neutralises an embedded tag rather than emitting it', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes quotes in body text', () => {
    // escapeHtml covers quotes too, so the campaign body cannot break out of
    // any attribute a later template drops it into.
    const html = renderMarkdown('she said "hi" and \'bye\'')
    expect(html).not.toContain('"hi"')
    expect(html).toContain('&quot;')
  })

  it('escapes a double quote inside a link href so it cannot break the attribute', () => {
    const html = renderMarkdown('[x](https://e.g/a"onmouseover=1)')
    expect(html).toContain('&quot;')
    expect(html).not.toMatch(/href="[^"]*"[a-z]/)
  })
})

describe('renderMarkdown — the supported subset', () => {
  it('renders # ## ### as h2 h3 h4, with the subject holding h1', () => {
    expect(renderMarkdown('# One')).toContain('<h2')
    expect(renderMarkdown('## Two')).toContain('<h3')
    expect(renderMarkdown('### Three')).toContain('<h4')
  })

  it('renders a dash or star list as a single ul', () => {
    const html = renderMarkdown('- one\n- two')
    expect(html.match(/<ul/g)).toHaveLength(1)
    expect(html.match(/<li/g)).toHaveLength(2)
    expect(renderMarkdown('* one\n* two')).toContain('<li')
  })

  it('renders bold and italic', () => {
    expect(renderMarkdown('a **b** c')).toContain('<strong>b</strong>')
    expect(renderMarkdown('a *b* c')).toContain('<em>b</em>')
  })

  it('renders a link with the palette colour', () => {
    const html = renderMarkdown('[Acme](https://example.com)')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('>Acme</a>')
  })

  it('splits on blank lines into one paragraph each', () => {
    const html = renderMarkdown('one\ntwo\n\nthree')
    expect(html.match(/<p /g)).toHaveLength(2)
  })

  it('normalises CRLF and drops empty blocks', () => {
    expect(renderMarkdown('a\r\n\r\n\r\nb').match(/<p /g)).toHaveLength(2)
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n\n  ')).toBe('')
  })

  it('leaves unsupported markdown as escaped literal text', () => {
    // No code fences, no blockquotes, no images: Outlook drops most of it, so
    // the subset stops here and anything else reads as plain text.
    const html = renderMarkdown('> quoted\n\n`code`')
    expect(html).toContain('&gt; quoted')
    expect(html).toContain('`code`')
    expect(html).not.toContain('<blockquote')
  })
})

describe('unsubscribe tokens', () => {
  it('round-trips a person id', () => {
    const token = unsubscribeToken('person-123')
    expect(token).toBeTruthy()
    expect(verifyUnsubscribeToken(token as string)).toBe('person-123')
  })

  it('carries the id and a signature, and nothing resembling an email', () => {
    const token = unsubscribeToken('person-123') as string
    expect(token.startsWith('person-123.')).toBe(true)
    expect(token).not.toContain('@')
  })

  it('rejects a tampered signature', () => {
    const token = unsubscribeToken('person-123') as string
    const [id, sig] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)]
    const flipped = sig[0] === 'A' ? `B${sig.slice(1)}` : `A${sig.slice(1)}`
    expect(verifyUnsubscribeToken(`${id}.${flipped}`)).toBeNull()
  })

  it('rejects another person id pasted in front of a valid signature', () => {
    const token = unsubscribeToken('person-123') as string
    const sig = token.slice(token.lastIndexOf('.') + 1)
    expect(verifyUnsubscribeToken(`person-456.${sig}`)).toBeNull()
  })

  it('rejects a signature of the wrong length without comparing bytes', () => {
    // timingSafeEqual throws on unequal lengths, so the length check has to
    // come first; a truncated token must return null, not blow up the page.
    const token = unsubscribeToken('person-123') as string
    expect(verifyUnsubscribeToken(token.slice(0, -4))).toBeNull()
  })

  it('rejects a token with no separator at all', () => {
    expect(verifyUnsubscribeToken('nodot')).toBeNull()
    expect(verifyUnsubscribeToken('.leading')).toBeNull()
    expect(verifyUnsubscribeToken('')).toBeNull()
  })

  it('splits on the LAST dot, so an id containing dots survives', () => {
    const token = unsubscribeToken('a.b.c') as string
    expect(verifyUnsubscribeToken(token)).toBe('a.b.c')
  })

  it('returns null from both sides when no secret is configured', () => {
    const secret = process.env.UNSUBSCRIBE_SECRET
    delete process.env.UNSUBSCRIBE_SECRET
    try {
      expect(unsubscribeToken('person-123')).toBeNull()
      expect(verifyUnsubscribeToken('person-123.whatever')).toBeNull()
    } finally {
      process.env.UNSUBSCRIBE_SECRET = secret
    }
  })
})
