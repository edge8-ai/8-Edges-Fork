import { Resend } from 'resend'
import { supabase, companyOs } from '@/kernel/data/supabase'
import { getOrCreatePerson } from '@/kernel/data/company-os'
import { notifyOps } from '@/kernel/messaging/lark'
import { selectJobRequisitions, attachApplicationResume, getOrCreateApplication, screenNewApplication } from '@/entities/hiring'
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { runInBackground } from '@/kernel/audit/background'
import { escapeHtml } from '@/kernel/config/html'
import { isEmail } from '@/kernel/config/validate'
import { updatePeople } from '@/kernel/identity/writes'
import { OPS_EMAIL } from "@/kernel/config/contacts";
import { SOURCE_SITE } from '@/kernel/config/utils'
import { externalHref } from '@/kernel/ui/url'

// The staff email shows the LinkedIn the applicant typed. Escaping stops it
// breaking the HTML but not a `javascript:` href, so the link is drawn only
// when the value is one; otherwise the text is shown as typed.
function linkedinCell(linkedin: string | null): string {
  if (!linkedin) return '—'
  const href = externalHref(linkedin)
  return href ? `<a href="${escapeHtml(href)}">${escapeHtml(linkedin)}</a>` : escapeHtml(linkedin)
}

const FROM = process.env.CAREERS_EMAIL_FROM ?? ''
const DEFAULT_RECIPIENTS = [OPS_EMAIL]
const MAX_RESUME_BYTES = 10 * 1024 * 1024
const MAX_TEXT_CHARS = 10_000

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()

    const website = String(form.get('website') ?? '')
    if (website) return NextResponse.json({ ok: true }) // honeypot

    const job_id = String(form.get('job_id') ?? '')
    const job_title = String(form.get('job_title') ?? '')
    const job_slug = String(form.get('job_slug') ?? '')
    // The name the applicant typed, not a people column: named apart from the
    // column so the S.16 name ratchet does not read it as a fallback chain.
    const typedName = String(form.get('full_name') ?? '').trim()
    const email = String(form.get('email') ?? '').trim()
    const phone = String(form.get('phone') ?? '').trim() || null
    const linkedin = String(form.get('linkedin') ?? '').trim() || null
    const cover_letter = String(form.get('cover_letter') ?? '').trim().slice(0, MAX_TEXT_CHARS) || null
    const resume = form.get('resume')

    if (!job_id || !typedName || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!isEmail(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }
    if (!(resume instanceof File) || resume.size === 0) {
      return NextResponse.json({ error: 'Resume file is required' }, { status: 400 })
    }
    if (resume.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: 'Resume is too large (max 10 MB)' }, { status: 400 })
    }

    // Per-role questions come from the requisition (source of truth), never
    // from the client — the answers snapshot pairs each configured question
    // with the submitted answer_<i> field.
    const { data: reqRow, error: reqErr } = await selectJobRequisitions('application_questions')
      .eq('id', job_id)
      .maybeSingle()
    // The questions are the source of truth for the answers snapshot, so a
    // failed read would silently store an application with every per-role
    // answer dropped. Fail the submission instead and let the candidate retry.
    if (reqErr) {
      console.error('[careers] job_requisitions lookup failed for', job_id, reqErr.message)
      return NextResponse.json({ error: 'Could not load the role. Please try again.' }, { status: 500 })
    }
    const questions: string[] = Array.isArray(reqRow?.application_questions)
      ? (reqRow.application_questions as unknown[]).filter((q): q is string => typeof q === 'string').slice(0, 3)
      : []
    const answers = questions.map((q, i) => ({
      q,
      a: String(form.get(`answer_${i}`) ?? '').trim().slice(0, MAX_TEXT_CHARS),
    }))

    // 1) Upload resume to private storage bucket
    const filename = sanitizeFilename(resume.name || 'resume.pdf')
    const storagePath = `${job_id}/${randomUUID()}-${filename}`
    const buffer = Buffer.from(await resume.arrayBuffer())
    const { error: uploadErr } = await supabase.storage
      .from('resumes')
      .upload(storagePath, buffer, {
        contentType: resume.type || 'application/octet-stream',
        upsert: false,
      })
    if (uploadErr) {
      console.error('Resume upload error:', uploadErr)
      return NextResponse.json({ error: 'Failed to upload resume' }, { status: 500 })
    }

    // 2) company_os: person → application → resume document
    const person = await getOrCreatePerson({
      email,
      name: typedName,
      phone,
      linkedin,
      source: SOURCE_SITE ? `${SOURCE_SITE}/careers` : 'careers',
    })
    if (!person.ok) {
      console.error('Person upsert error:', person.error)
      return NextResponse.json({ error: 'Failed to save applicant' }, { status: 500 })
    }

    const application = await getOrCreateApplication(person.id, job_id, {
      coverLetter: cover_letter,
      answers,
      meta: { job_slug, job_title },
    })
    if (!application.ok) {
      console.error('Application error:', application.error)
      return NextResponse.json({ error: 'Failed to link application' }, { status: 500 })
    }

    // Tag the applicant as a job seeker so recruiter tooling (applicant status
    // control, Contact 360) treats them as an applicant. Only fill an unset
    // persona — never overwrite an existing prospect/client/employee who also
    // happens to apply. Best-effort; a failure here must not fail the apply.
    await updatePeople({ persona: 'job_seeker' })
      .eq('id', person.id)
      .is('persona', null)

    const doc = await attachApplicationResume(application.id, {
      storagePath,
      mimeType: resume.type || null,
      byteSize: resume.size,
      personName: typedName,
    })
    if (!doc.ok) {
      console.error('Resume document error:', doc.error)
      return NextResponse.json({ error: 'Failed to save resume' }, { status: 500 })
    }

    // 3) AI resume screen runs after the response is sent; the applicant never
    // waits on it. Failures land in ai_screen_status for admin re-scan.
    runInBackground('/background/resume-screen/', `application ${application.id}`, () => screenNewApplication(application.id))

    // 4) Signed URL for recruiter convenience (7 days)
    const { data: signed, error: signedError } = await supabase.storage
      .from('resumes')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7)
    if (signedError) console.error('[site] resume signed URL failed:', signedError.message)

    // 5) Notify recruiters via Resend (best-effort)
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    const recipients = Array.from(new Set([...DEFAULT_RECIPIENTS, ...adminEmails]))
    const apiKey = process.env.RESEND_API_KEY
    if (apiKey) {
      try {
        const answersHtml = answers
          .filter((x) => x.a)
          .map(
            (x) =>
              `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">Q: ${escapeHtml(x.q)}</td><td style="white-space:pre-wrap">${escapeHtml(x.a)}</td></tr>`,
          )
          .join('')
        const resend = new Resend(apiKey)
        await resend.emails.send({
          from: FROM,
          to: recipients,
          replyTo: email,
          subject: `New application: ${job_title || 'role'} — ${typedName}`,
          html: `
            <h2>New job application</h2>
            <table style="border-collapse:collapse;font-family:sans-serif;font-size:15px">
              <tr><td style="padding:6px 16px 6px 0;color:#666">Role</td><td><strong>${escapeHtml(job_title)}</strong> (${escapeHtml(job_slug)})</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Applicant</td><td>${escapeHtml(typedName)}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Phone</td><td>${phone ? escapeHtml(phone) : '—'}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">LinkedIn</td><td>${linkedinCell(linkedin)}</td></tr>
              <tr><td style="padding:6px 16px 6px 0;color:#666">Resume</td><td>${signed?.signedUrl ? `<a href="${signed.signedUrl}">Download (7-day link)</a>` : escapeHtml(storagePath)}</td></tr>
              ${cover_letter ? `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">Cover letter</td><td style="white-space:pre-wrap">${escapeHtml(cover_letter)}</td></tr>` : ''}
              ${answersHtml}
              <tr><td style="padding:6px 16px 6px 0;color:#666">Application ID</td><td><code>${application.id}</code></td></tr>
            </table>
          `,
        })
      } catch (mailErr) {
        console.error('Resend error:', mailErr)
      }
    }

    // Ops channel notice (every submission)
    void notifyOps(
      `🔔 New job application\n${typedName} <${email}> — ${job_title || 'role'}${phone ? ` · ${phone}` : ''}${linkedin ? `\n${linkedin}` : ''}`,
      { category: 'people_ops' },
    )

    return NextResponse.json({ ok: true, application_id: application.id })
  } catch (err) {
    console.error('Apply route error:', err)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}

