import { beforeEach, describe, expect, it, vi } from 'vitest'

// M1.1: the signed upload for a careers CV. Public, so it signs only for an
// open, public role and only a PDF or Word file under the limit.
const { role, signedPaths } = vi.hoisted(() => ({
  role: { row: null as { id: string } | null, error: null as { message: string } | null, reads: 0 },
  signedPaths: [] as string[],
}))

vi.mock('@/kernel/data/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          signedPaths.push(path)
          return { data: { signedUrl: `https://storage.example/upload/${path}` }, error: null }
        },
      }),
    },
  },
}))
vi.mock('@/entities/hiring', () => ({
  selectJobRequisitions: () => {
    role.reads += 1
    const chain = { eq: () => chain, maybeSingle: async () => ({ data: role.row, error: role.error }) }
    return chain
  },
}))

import { POST } from './route'
import type { NextRequest } from 'next/server'

function start(body: Record<string, unknown>) {
  return POST(new Request('https://edge8.test/api/careers/apply/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest)
}

const R1 = '7d444840-9dc0-11d1-b245-5ffdce74fad2'
const PDF = { job_id: R1, file_name: 'My CV (final).pdf', file_type: 'application/pdf', file_size: 8 * 1024 * 1024 }

beforeEach(() => {
  role.row = { id: R1 }
  role.error = null
  role.reads = 0
  signedPaths.length = 0
})

describe('careers CV upload', () => {
  it("signs an 8 MB PDF into the role's folder with a safe name", async () => {
    const res = await start(PDF)
    expect(res.status).toBe(200)
    const json = (await res.json()) as { path: string; url: string }
    expect(json.path).toMatch(new RegExp(`^${R1}/[0-9a-f-]{36}-My_CV__final_\\.pdf$`))
    expect(json.url).toContain(json.path)
  })

  it('refuses a file over 10 MB or of another type, before signing', async () => {
    expect((await start({ ...PDF, file_size: 11 * 1024 * 1024 })).status).toBe(400)
    expect((await start({ ...PDF, file_type: 'image/heic' })).status).toBe(400)
    expect(signedPaths).toEqual([])
  })

  it('refuses inherited object keys as a file type', async () => {
    for (const fileType of ['constructor', 'toString', '__proto__']) {
      expect((await start({ ...PDF, file_type: fileType })).status).toBe(400)
    }
    expect(signedPaths).toEqual([])
  })

  // The role id becomes the storage folder, so a value that is not a uuid is
  // refused before the role is read or anything is signed.
  it('refuses a role id that is not a uuid, before reading the role', async () => {
    for (const jobId of ['', '..', 'r1', `${R1}/..`]) {
      expect((await start({ ...PDF, job_id: jobId })).status).toBe(400)
    }
    expect(role.reads).toBe(0)
    expect(signedPaths).toEqual([])
  })

  it('refuses a role that is closed or not public', async () => {
    role.row = null
    expect((await start(PDF)).status).toBe(410)
    expect(signedPaths).toEqual([])
  })

  it('says to retry, not that the role closed, when the role read fails', async () => {
    role.error = { message: 'timeout' }
    expect((await start(PDF)).status).toBe(500)
    expect(signedPaths).toEqual([])
  })
})
