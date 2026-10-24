import { supabase } from '@/kernel/data/supabase'
import { selectJobRequisitions } from '@/entities/hiring'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { RESUME_MAX_BYTES, RESUME_TYPES, isRoleId, sanitizeResumeFilename } from '@/entities/site/lib/resume-upload'

// Signed-URL issuer for the careers CV. The form used to post the file through
// /api/careers/apply, and Vercel refuses a body over about 4.5 MB before the
// route runs, so a larger CV failed with a parse error and the application was
// lost (M1.1). Now the form sends only the file's name, type and size; we sign
// one upload into the private `resumes` bucket under the role's folder, and the
// browser PUTs the file straight to Storage. Public by design (applicants are
// not signed in) but scoped: only for a role that is open and public, only a
// PDF or Word file, and the apply route re-checks the stored object itself.

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      job_id?: string
      file_name?: string
      file_type?: string
      file_size?: number
    } | null
    const jobId = String(body?.job_id ?? '')
    const fileName = String(body?.file_name ?? '')
    const fileType = String(body?.file_type ?? '')
    const fileSize = Number(body?.file_size ?? 0)

    // The id becomes the storage folder and the role query's filter, so a
    // value that cannot be a role id stops here as the caller's mistake.
    if (!isRoleId(jobId)) return NextResponse.json({ error: 'Missing role.' }, { status: 400 })
    if (!fileType || !Number.isFinite(fileSize) || fileSize <= 0)
      return NextResponse.json({ error: 'No file.' }, { status: 400 })
    if (!RESUME_TYPES.has(fileType))
      return NextResponse.json({ error: 'Attach your resume as a PDF or Word file.' }, { status: 400 })
    if (fileSize > RESUME_MAX_BYTES)
      return NextResponse.json({ error: 'Resume is too large (max 10 MB).' }, { status: 400 })

    const { data: role, error: roleError } = await selectJobRequisitions('id')
      .eq('id', jobId)
      .eq('status', 'open')
      .eq('is_public', true)
      .maybeSingle()
    // A failed read is not "no such role": tell the applicant to retry rather
    // than that the role closed.
    if (roleError) {
      console.error('[careers upload] job_requisitions read failed:', roleError.message)
      return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
    }
    if (!role) return NextResponse.json({ error: 'This role is no longer open.' }, { status: 410 })

    const path = `${jobId}/${randomUUID()}-${sanitizeResumeFilename(fileName || 'resume.pdf')}`
    const { data: signed, error: signError } = await supabase.storage.from('resumes').createSignedUploadUrl(path)
    if (signError || !signed?.signedUrl) {
      console.error('[careers upload] sign failed:', signError?.message)
      return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, path, url: signed.signedUrl })
  } catch (err) {
    console.error('[careers upload] error:', err)
    return NextResponse.json({ error: 'Could not start the upload. Please try again.' }, { status: 500 })
  }
}
