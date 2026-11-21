import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { mustRows } from "@/kernel/data/read";
import { companyOs, supabase } from "@/kernel/data/supabase";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "40 19 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "CV sweep",
  description: "Daily at 02:40. Deletes CVs in the resumes bucket that no document names and that are older than a day (a week for a recruiter's unsaved intake draft): an upload the applicant never submitted, or the file of an application that was deleted. A failed read deletes nothing, and so does a night that finds more than fifty.",
  content: ["Resumes", "Documents"],
  apps: ["Supabase"],
};

// Vercel cron: daily 19:40 UTC (02:40 Asia/Ho_Chi_Minh), before the receipt
// sweep, when nobody is applying. The resumes bucket's housekeeping (MO.3).
//
// A CV is in the bucket before anything names it. The careers form signs an
// upload and the browser PUTs the file; only the submit writes the documents
// row. A form abandoned after the upload leaves a file nobody submitted. The
// admin upload and the resume intake store the file first as well. And
// deleting an application deletes its documents rows but not its file, which
// is how eight CVs of deleted applicants were still stored on 2026-10-21. A
// file is attached exactly when a company_os.documents row's storage_path
// names it; nothing else in the app points into this bucket.
//
// The walk starts from the bucket, not from a table, because an orphan has
// no row to start from. Three rules keep it from deleting what it should not:
// - Every read is a must-read. A listing or a documents read that fails
//   deletes nothing: "no row names it" must never be what an error says.
// - A grace period. The careers form uploads and submits in one sitting, so a
//   day is enough there. The resume intake (admin/intake/) keeps its draft in
//   the recruiter's browser until it is saved, and a tab can stay open over a
//   weekend, so its files get a week (db-review on #2271). A file whose age
//   Storage does not give is kept.
// - A ceiling. Fifty unattached files in one night is not housekeeping, it is
//   a sign the documents read or the paths changed shape, so the run deletes
//   nothing and fails, naming the count, for a person to read.
//
// The run's record names counts and errors, never a path: a CV's file name is
// usually the applicant's name, and routine runs are read on Settings -> Agents.

const ROUTINE_ID = "/api/cron/resumes-sweep/";
const BUCKET = "resumes";
const DAY_MS = 24 * 60 * 60 * 1000;
/** The resume intake's drafts wait in a browser, not a form; see above. */
const INTAKE_PREFIX = "admin/intake/";
const INTAKE_GRACE_MS = 7 * DAY_MS;
/** More unattached files than this in one run deletes nothing; see above. */
const MAX_REMOVALS = 50;
/** Storage lists at most this many entries a call; a folder with more is paged. */
const LIST_PAGE = 1000;
/** The bucket's folders are `<role>/` and `admin/<application or intake>/`; deeper is not ours. */
const MAX_DEPTH = 3;
/** Paths per documents read and per remove call. */
const BATCH = 100;

type StoredFile = { path: string; createdAt: string | null };
type Entry = { name: string; id: string | null; created_at?: string | null };
type Report = { stored: number; attached: number; recent: number; removed: number; failed: string[] };

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every file under `prefix`, walking folders (entries with no id). Raises on any failed listing. */
async function listFiles(prefix: string, depth: number): Promise<StoredFile[]> {
  const files: StoredFile[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: LIST_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listing ${prefix ? "a folder" : "the bucket"}: ${error.message}`);
    const entries = (data ?? []) as Entry[];
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push({ path, createdAt: entry.created_at ?? null });
      else if (depth < MAX_DEPTH) files.push(...(await listFiles(path, depth + 1)));
    }
    if (entries.length < LIST_PAGE) return files;
  }
}

/** The paths among `paths` a documents row names. A must-read: a failure raises. */
async function attachedPaths(paths: string[]): Promise<Set<string>> {
  const named = new Set<string>();
  for (let i = 0; i < paths.length; i += BATCH) {
    const rows = mustRows(
      await companyOs.from("documents").select("storage_path").in("storage_path", paths.slice(i, i + BATCH)),
      "documents naming a stored CV",
    ) as { storage_path: string | null }[];
    for (const r of rows) if (r.storage_path) named.add(r.storage_path);
  }
  return named;
}

async function handler(_req: Request) {
  const report: Report = { stored: 0, attached: 0, recent: 0, removed: 0, failed: [] };
  const now = Date.now();
  const graceOver = (f: StoredFile) => f.createdAt !== null && Date.parse(f.createdAt) < now - (f.path.startsWith(INTAKE_PREFIX) ? INTAKE_GRACE_MS : DAY_MS);
  try {
    const files = await listFiles("", 1);
    report.stored = files.length;
    const old = files.filter(graceOver);
    report.recent = files.length - old.length;
    const named = await attachedPaths(old.map((f) => f.path));
    report.attached = named.size;
    const orphans = old.filter((f) => !named.has(f.path)).map((f) => f.path);
    if (orphans.length > MAX_REMOVALS) {
      report.failed.push(`${orphans.length} unattached CVs is more than the ${MAX_REMOVALS} one run may delete; nothing was deleted`);
    } else {
      for (let i = 0; i < orphans.length; i += BATCH) {
        const batch = orphans.slice(i, i + BATCH);
        const { error } = await supabase.storage.from(BUCKET).remove(batch);
        if (error) report.failed.push(`removing ${batch.length} CV(s): ${error.message}`);
        else report.removed += batch.length;
      }
    }
  } catch (err) {
    console.error("[resumes-sweep]", messageOf(err));
    report.failed.push(messageOf(err));
  }
  // Anything the sweep could not do makes an error run that names it (Y.13).
  return routineResult({
    status: "ok",
    ...report,
    failures: failuresFrom(report.failed, "sweep", "CV sweep"),
  });
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
