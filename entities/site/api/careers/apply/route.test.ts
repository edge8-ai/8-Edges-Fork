import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builderFor, calls, resetFake, script } from '@/kernel/data/testing/fake-company-os'

// W.118.1. The careers form is public, so its LinkedIn field is anyone's text.
// getOrCreatePerson runs for real here: a `javascript:` value must reach neither
// the stored person row nor an href in the staff notification email.
const { emails } = vi.hoisted(() => ({ emails: [] as { html: string }[] }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (m: { html: string }) => { emails.push(m); return { data: { id: 'e1' }, error: null } } }
  },
}))
vi.mock('@/kernel/data/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.example/cv' }, error: null }),
      }),
    },
  },
  companyOs: { from: (table: string) => builderFor(table) },
}))
vi.mock('@/kernel/identity/writes', () => ({
  upsertPeople: (row: unknown) => builderFor('people').upsert(row),
  updatePeople: (row: unknown) => builderFor('people').update(row),
}))
vi.mock('@/kernel/messaging/lark', () => ({ notifyOps: vi.fn(async () => {}) }))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))
// The background run (Y.24) is the kernel's to test; here it only has to be started.
vi.mock('@/kernel/audit/background', () => ({ runInBackground: vi.fn() }))
vi.mock('@/entities/hiring', () => ({
  selectJobRequisitions: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { application_questions: [] }, error: null }) }) }),
  getOrCreateApplication: async () => ({ ok: true, id: 'a1' }),
  attachApplicationResume: async () => ({ ok: true }),
  screenApplication: async () => {},
}))

import { POST } from './route'
import type { NextRequest } from 'next/server'

function apply(linkedin: string) {
  const form = new FormData()
  form.set('job_id', 'r1')
  form.set('job_title', 'Engineer')
  form.set('full_name', 'Someone')
  form.set('email', 'someone@example.test')
  form.set('linkedin', linkedin)
  form.set('resume', new File(['cv'], 'cv.pdf', { type: 'application/pdf' }))
  return POST(new Request('https://edge8.test/api/careers/apply', { method: 'POST', body: form }) as unknown as NextRequest)
}

// people, in order: the upsert, the read-back, the LinkedIn enrich (only when
// there is a link to add), then the job-seeker persona tag.
const peopleWrites = () => calls.filter((c) => c.payloads.length > 0).map((c) => c.payloads[0] as Record<string, unknown>)

beforeEach(() => {
  resetFake()
  emails.length = 0
  process.env.RESEND_API_KEY = 'test-key'
})

describe('careers apply · LinkedIn', () => {
  it('stores a javascript: LinkedIn nowhere and emails it as inert text', async () => {
    script('people', {}, { data: { id: 'p1', linkedin_url: null } }, {})
    const res = await apply('javascript:alert(document.cookie)')
    expect(res.status).toBe(200)
    expect(peopleWrites()).toEqual([expect.objectContaining({ linkedin_url: null }), { persona: 'job_seeker' }])
    expect(emails).toHaveLength(1)
    expect(emails[0].html).not.toMatch(/href="javascript:/i)
    expect(emails[0].html).toContain('<td>javascript:alert(document.cookie)</td>')
  })

  it('stores and links a schemeless profile as https', async () => {
    script('people', {}, { data: { id: 'p1', linkedin_url: null } }, {}, {})
    await apply('linkedin.com/in/someone')
    expect(peopleWrites().slice(0, 2)).toEqual([
      expect.objectContaining({ linkedin_url: 'https://linkedin.com/in/someone' }),
      { linkedin_url: 'https://linkedin.com/in/someone' },
    ])
    expect(emails[0].html).toContain('<a href="https://linkedin.com/in/someone">linkedin.com/in/someone</a>')
  })
})
