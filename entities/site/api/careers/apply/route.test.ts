import { beforeEach, describe, expect, it, vi } from 'vitest'
import { builderFor, calls, resetFake, script } from '@/kernel/data/testing/fake-company-os'

// W.118.1. The careers form is public, so its LinkedIn field is anyone's text.
// getOrCreatePerson runs for real here: a `javascript:` value must reach neither
// the stored person row nor an href in the staff notification email.
const { emails, stored, removed, infoFailure, uploads } = vi.hoisted(() => ({
  emails: [] as { html: string }[],
  // What Storage reports for an uploaded object, by path (M1.1).
  stored: new Map<string, { size: number; contentType: string }>(),
  removed: [] as string[],
  // An error Storage returns for every info read, when a test sets one.
  infoFailure: { error: null as { message: string; status?: number; statusCode?: string } | null },
  // Paths the legacy attached-file branch stored.
  uploads: [] as string[],
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async (m: { html: string }) => { emails.push(m); return { data: { id: 'e1' }, error: null } } }
  },
}))
vi.mock('@/kernel/data/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async (path: string) => { uploads.push(path); return { error: null } },
        info: async (path: string) =>
          infoFailure.error
            ? { data: null, error: infoFailure.error }
            : stored.has(path)
              ? { data: stored.get(path), error: null }
              : { data: null, error: { message: 'Object not found', status: 400, statusCode: '404' } },
        remove: async (paths: string[]) => { removed.push(...paths); return { error: null } },
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

const R1 = '7d444840-9dc0-11d1-b245-5ffdce74fad2'
const R2 = '9b2f1c3e-4a5d-4e6f-8a7b-1c2d3e4f5a6b'

function apply(linkedin: string) {
  const form = new FormData()
  form.set('job_id', R1)
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
  stored.clear()
  removed.length = 0
  infoFailure.error = null
  uploads.length = 0
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

// M1.1: the CV now reaches Storage straight from the browser, so the route
// takes a path, and must judge the stored object rather than the form's word.
describe('careers apply · uploaded resume', () => {
  const PATH = `${R1}/0f8fad5b-d9cb-469f-a165-70867728950e-cv.pdf`

  function applyWithPath(path: string) {
    const form = new FormData()
    form.set('job_id', R1)
    form.set('full_name', 'Someone')
    form.set('email', 'someone@example.test')
    form.set('resume_path', path)
    return POST(new Request('https://edge8.test/api/careers/apply', { method: 'POST', body: form }) as unknown as NextRequest)
  }

  it('accepts a PDF the browser uploaded for this role', async () => {
    stored.set(PATH, { size: 6 * 1024 * 1024, contentType: 'application/pdf' })
    script('people', {}, { data: { id: 'p1', linkedin_url: null } }, {})
    const res = await applyWithPath(PATH)
    expect(res.status).toBe(200)
    expect(removed).toEqual([])
  })

  it("refuses another role's path without touching Storage", async () => {
    const res = await applyWithPath(`${R2}/0f8fad5b-d9cb-469f-a165-70867728950e-cv.pdf`)
    expect(res.status).toBe(400)
    expect(removed).toEqual([])
  })

  it('asks for the file again when the upload never arrived', async () => {
    const res = await applyWithPath(PATH)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/did not finish uploading/)
  })

  it('asks for the file again when Storage answers a plain HTTP 404', async () => {
    infoFailure.error = { message: 'not_found', status: 404, statusCode: 'NoSuchKey' }
    expect((await applyWithPath(PATH)).status).toBe(400)
  })

  // A Storage outage is not the applicant's upload failing: asking for the
  // file again would leave another orphan and fail the same way.
  it('logs a Storage failure and says to retry, without asking for the file again', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    infoFailure.error = { message: 'upstream timeout', status: 503, statusCode: '503' }
    const res = await applyWithPath(PATH)
    expect(res.status).toBe(500)
    expect(((await res.json()) as { error: string }).error).toBe('We could not check your resume. Please try again.')
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[careers]'), PATH, 'upstream timeout')
    expect(removed).toEqual([])
    logged.mockRestore()
  })

  it('removes and refuses a stored object over the limit or of the wrong type', async () => {
    stored.set(PATH, { size: 11 * 1024 * 1024, contentType: 'application/pdf' })
    expect((await applyWithPath(PATH)).status).toBe(400)
    stored.set(PATH, { size: 1024, contentType: 'text/html' })
    expect((await applyWithPath(PATH)).status).toBe(400)
    stored.set(PATH, { size: 1024, contentType: 'constructor' })
    expect((await applyWithPath(PATH)).status).toBe(400)
    expect(removed).toEqual([PATH, PATH, PATH])
  })
})

// The role id becomes the storage folder. Before the uuid check, the attached
// file of an older form was stored under whatever id the form sent.
describe('careers apply · role id', () => {
  it('refuses a role id that is not a uuid, before storing anything', async () => {
    for (const jobId of ['..', 'r1', `${R1}/..`]) {
      const form = new FormData()
      form.set('job_id', jobId)
      form.set('full_name', 'Someone')
      form.set('email', 'someone@example.test')
      form.set('resume', new File(['cv'], 'cv.pdf', { type: 'application/pdf' }))
      const res = await POST(new Request('https://edge8.test/api/careers/apply', { method: 'POST', body: form }) as unknown as NextRequest)
      expect(res.status).toBe(400)
    }
    expect(uploads).toEqual([])
  })
})
