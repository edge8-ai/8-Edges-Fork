import { beforeEach, describe, expect, it, vi } from 'vitest'

// The contact form needs no sign-in, and everything a visitor types lands in
// the staff email's HTML. A reviewer put a working <a href> into that email
// through the name field; every field is now escaped (S.16.25).
//
// Since Z.11 the route hands each inquiry to the inquiry-to-lead chain: live,
// the chain promotes and posts; off or in shadow (or when the run cannot be
// opened), the route promotes and posts the raw form exactly as before.

const sent: { html: string }[] = []
const calls = vi.hoisted(() => ({
  person: { ok: false, error: 'skipped in test' } as { ok: boolean; id?: string; error?: string },
  todaysPath: true,
  opened: [] as string[],
  promoted: [] as string[],
  inserted: [] as Record<string, unknown>[],
}))
vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (args: { html: string }) => {
        sent.push(args)
        return { data: { id: 'e1' }, error: null }
      },
    }
  },
}))
vi.mock('@/kernel/data/supabase', () => ({ companyOs: {} }))
vi.mock('@/kernel/data/company-os', () => ({ getOrCreatePerson: async () => calls.person }))
vi.mock('@/entities/campaigns', () => ({ campaignIdForUtm: async () => null }))
vi.mock('@/entities/crm', async (importActual) => {
  // The spam gate stays the real one: the route must still drop what it always dropped.
  const actual = await importActual<typeof import('@/entities/crm/lib/inquiry-screen')>()
  return {
    looksSpammy: actual.looksSpammy,
    promotePersonToLead: async (id: string) => (calls.promoted.push(id), { ok: true, promoted: true }),
    insertInquiries: (row: Record<string, unknown>) => {
      calls.inserted.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'inq-1' }, error: null }) }) }
    },
    openInquiryRun: async (id: string) => (calls.opened.push(id), { mode: calls.todaysPath ? 'shadow' : 'live', todaysPath: calls.todaysPath }),
  }
})
const notifyOps = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/kernel/messaging/lark', () => ({ notifyOps }))

import { POST } from './route'

const post = (body: Record<string, unknown>) =>
  POST(new Request('https://edge8.test/api/contact', { method: 'POST', body: JSON.stringify(body) }) as never)

const FORM = { name: 'Visitor Alpha', email: 'visitor@example.test', company: 'Example Freight', teamSize: '51 - 200', message: 'We want AI across operations.' }

beforeEach(() => {
  sent.length = 0
  calls.person = { ok: false, error: 'skipped in test' }
  calls.todaysPath = true
  calls.opened.length = 0
  calls.promoted.length = 0
  calls.inserted.length = 0
  notifyOps.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the staff email for a contact submission', () => {
  it('escapes every field the visitor typed', async () => {
    const res = await post({
      name: 'Mai <a href="https://evil.test">click</a>',
      email: 'mai@example.test',
      company: '<b>Acme</b>',
      teamSize: '<i>10</i>',
      message: 'line one\n<script>alert(1)</script>',
    })
    expect(res.status).toBe(200)
    const { html } = sent[0]
    expect(html).toContain('Mai &lt;a href=&quot;https://evil.test&quot;&gt;click&lt;/a&gt;')
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;')
    expect(html).toContain('&lt;i&gt;10&lt;/i&gt;')
    expect(html).toContain('line one<br>&lt;script&gt;')
    for (const raw of ['<a href="https://evil.test">', '<b>Acme</b>', '<i>10</i>', '<script>']) expect(html).not.toContain(raw)
  })
})

describe('the hand-off to the inquiry-to-lead chain', () => {
  it('off or in shadow: the route promotes and posts the raw form as before, and the staff email goes out', async () => {
    calls.person = { ok: true, id: 'p1' }
    calls.todaysPath = true
    await post(FORM)
    expect(calls.inserted).toHaveLength(1)
    expect(calls.opened).toEqual(['inq-1'])
    expect(calls.promoted).toEqual(['p1'])
    expect(notifyOps).toHaveBeenCalledTimes(1)
    expect(String((notifyOps.mock.calls[0] as unknown[])[0])).toContain('We want AI across operations.')
    expect(sent).toHaveLength(1)
  })

  it('live: the chain promotes and posts its own line; the route does neither, and the staff email still goes out', async () => {
    calls.person = { ok: true, id: 'p1' }
    calls.todaysPath = false
    await post(FORM)
    expect(calls.opened).toEqual(['inq-1'])
    expect(calls.promoted).toEqual([])
    expect(notifyOps).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })

  it('a spam-pattern submission writes nothing and sends nothing', async () => {
    calls.person = { ok: true, id: 'p1' }
    const res = await post({ ...FORM, name: 'hiOTWjNqLzXbPw' })
    expect(res.status).toBe(200)
    expect(calls.inserted).toEqual([])
    expect(calls.opened).toEqual([])
    expect(notifyOps).not.toHaveBeenCalled()
    expect(sent).toEqual([])
  })
})
