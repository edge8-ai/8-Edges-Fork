// The rules a careers CV upload is held to, shared by the apply form (which
// checks before it uploads), the route that signs the upload, and the apply
// route that accepts the stored file. The CV goes straight from the browser to
// Storage through a signed URL because Vercel refuses a request body over about
// 4.5 MB before the function runs, and a scanned or phone-exported PDF is often
// bigger than that (M1.1 in the mobile plan). Nothing here is server-only: the
// form imports it.

import { isUuid } from '@/kernel/config/slug'

export const RESUME_MAX_BYTES = 10 * 1024 * 1024

// A Set rather than an object map: the type is the applicant's own string, and
// an object answers truthy for inherited keys such as `constructor` or
// `__proto__`, which would let a file through both routes as a "resume".
export const RESUME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

/**
 * Whether the role id from a public form can name a role. Both routes check
 * this before the id becomes a storage folder or reaches the `job_requisitions`
 * query, so a malformed id is the applicant's 400 rather than our 500, and a
 * path such as `..` is refused by rule rather than by a failing uuid cast.
 */
export function isRoleId(jobId: string): boolean {
  return isUuid(jobId)
}

export function sanitizeResumeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
}

/**
 * Whether a storage path is one the upload route could have signed for this
 * role: `<job id>/<uuid>-<sanitised name>`. The apply route accepts only such a
 * path, so a submission cannot attach another role's or another person's file.
 */
export function isResumePathFor(jobId: string, path: string): boolean {
  if (!isRoleId(jobId) || !path.startsWith(`${jobId}/`)) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,80}$/.test(path.slice(jobId.length + 1))
}
