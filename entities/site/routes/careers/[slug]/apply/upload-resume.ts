// The careers CV's trip to Storage, kept out of ApplyForm so the form stays
// a form. The CV goes straight from the browser to the private bucket through
// a signed URL: through this site's server it would hit Vercel's 4.5 MB body
// limit, and phone-scanned PDFs are often bigger (M1.1 in the mobile plan).

import { putToSignedUrl } from '@/kernel/ui/upload'
import { RESUME_TYPES } from '@/entities/site/lib/resume-upload'

// Some Android pickers hand over a Word file with no type at all, and others
// (Google Drive, file managers) call a PDF or Word file
// `application/octet-stream`. Either way the form would refuse a valid CV at
// pick time, and Storage would record the vague type, which the apply route
// refuses. The name's extension says what it is.
const TYPE_BY_EXTENSION = new Map<string, string>([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
])

/**
 * The picked file with a resume type the routes accept, read from its
 * extension whenever the browser's own type is not one of them. A type that is
 * already accepted is kept as reported, and a file whose extension is not a
 * resume's is returned unchanged for the form to refuse.
 */
export function typed(file: File): File {
  if (RESUME_TYPES.has(file.type)) return file
  const type = TYPE_BY_EXTENSION.get(file.name.split('.').pop()?.toLowerCase() ?? '')
  return type ? new File([file], file.name, { type }) : file
}

/** A reply's error message, even when the reply is not JSON (a proxy's 413 page). */
export async function replyError(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => null)) as { error?: string } | null
  return json?.error || fallback
}

/**
 * Uploads the CV and returns its storage path for the apply route. Throws an
 * Error whose message is fit to show the applicant.
 */
export async function uploadResume(jobId: string, resume: File, onProgress: (p: number) => void): Promise<string> {
  const start = await fetch('/api/careers/apply/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId, file_name: resume.name, file_type: resume.type, file_size: resume.size }),
  })
  if (!start.ok) throw new Error(await replyError(start, 'Could not upload your resume. Please try again.'))
  const { path, url } = (await start.json()) as { path: string; url: string }
  const put = await putToSignedUrl(url, resume, onProgress)
  if (!put.ok) throw new Error('Your resume did not upload. Check your connection and try again.')
  return path
}
