// The replenishment runs and their jobs as they are stored (RP.4; spec
// 2026-10-28, "Data"). The engine's output is written once, at upload: the
// run with a snapshot of the profile it was built from, and every job in
// walking order. Nothing re-runs the engine afterwards, so a profile edit can
// never change a run an operator is working.
//
// Every read raises on failure (kernel/data/read): a failed read of a run's
// jobs would otherwise render as "nothing to restock", which is a real answer
// a manager acts on.
import { companyOs, supabase, type Json } from "@/kernel/data/supabase";
import { ReadFailure, mustPages, mustPagesIn, mustRows } from "@/kernel/data/read";
import type { Job, LeftOut } from "./engine";
import { parseProfile, type Profile } from "./profile";

const TAG = "[replenishment/runs]";

/** The private bucket the uploaded exports are kept in (RP.2's migration). */
export const EXPORTS_BUCKET = "replenishment-exports";

export type RunStatus = "draft" | "sent" | "closed";

/** A run as the list shows it, with how many jobs it has and how many are done. */
export type RunSummary = {
  id: string;
  profileId: string;
  profileVersion: number;
  fileName: string;
  dataRows: number;
  truncated: boolean;
  status: RunStatus;
  uploadedBy: string | null;
  uploadedAt: string;
  sentBy: string | null;
  sentAt: string | null;
  closedBy: string | null;
  closedAt: string | null;
  jobs: number;
  done: number;
  /** Who finished its jobs (people.id), most jobs first. */
  workedBy: string[];
};

/**
 * A run with what its page needs: the left-out items and the profile it was
 * built from. `snapshot` is null when the stored copy no longer passes the
 * schema (a later schema change), and the page then falls back to plain words.
 */
export type RunDetail = Omit<RunSummary, "jobs" | "done" | "workedBy"> & { leftOut: LeftOut[]; snapshot: Profile | null };

/** A job as stored. Totals are numbers in the table and text here, as the operator reads them. */
export type StoredJob = {
  id: string;
  position: number;
  item: string;
  description: string;
  rule: string;
  band: string;
  pick: string;
  reserve: string;
  move: string;
  collect: { location: string; qty: string }[];
  destinations: string[];
  doneAt: string | null;
  binUsed: string | null;
  doneBy: string | null;
};

const RUN_COLUMNS =
  "id, profile_id, profile_version, file_name, data_rows, truncated, status, uploaded_by, uploaded_at, sent_by, sent_at, closed_by, closed_at";

type RunRow = {
  id: string;
  profile_id: string;
  profile_version: number;
  file_name: string;
  data_rows: number;
  truncated: boolean;
  status: string;
  uploaded_by: string | null;
  uploaded_at: string;
  sent_by: string | null;
  sent_at: string | null;
  closed_by: string | null;
  closed_at: string | null;
};

const runOf = (row: RunRow): Omit<RunSummary, "jobs" | "done" | "workedBy"> => ({
  id: row.id,
  profileId: row.profile_id,
  profileVersion: row.profile_version,
  fileName: row.file_name,
  dataRows: row.data_rows,
  truncated: row.truncated,
  status: row.status as RunStatus,
  uploadedBy: row.uploaded_by,
  uploadedAt: row.uploaded_at,
  sentBy: row.sent_by,
  sentAt: row.sent_at,
  closedBy: row.closed_by,
  closedAt: row.closed_at,
});

/** How many runs the list shows: a weekly round fills it in a few years. */
const LIST_LIMIT = 200;

type JobCounts = { jobs: number; done: number; workedBy: string[] };

/**
 * Each run's job count, done count and who did the work, from its jobs' three
 * completion columns. PostgREST has no grouped count, so the rows are read in
 * pages and counted here; a run with no jobs is absent from the map.
 */
async function jobCounts(runIds: string[]): Promise<Map<string, JobCounts>> {
  const jobs = await mustPagesIn<{ run_id: string; done_at: string | null; done_by: string | null }>(runIds, `${TAG} job counts`, (slice, from, to) =>
    companyOs.from("replenishment_jobs").select("run_id, done_at, done_by").in("run_id", slice).order("id").range(from, to),
  );
  const tally = new Map<string, { jobs: number; done: number; by: Map<string, number> }>();
  for (const job of jobs) {
    const t = tally.get(job.run_id) ?? { jobs: 0, done: 0, by: new Map<string, number>() };
    t.jobs += 1;
    if (job.done_at) {
      t.done += 1;
      if (job.done_by) t.by.set(job.done_by, (t.by.get(job.done_by) ?? 0) + 1);
    }
    tally.set(job.run_id, t);
  }
  const counts = new Map<string, JobCounts>();
  for (const [runId, t] of tally) {
    const workedBy = [...t.by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([person]) => person);
    counts.set(runId, { jobs: t.jobs, done: t.done, workedBy });
  }
  return counts;
}

const withCounts = async (rows: RunRow[]): Promise<RunSummary[]> => {
  const counts = await jobCounts(rows.map((r) => r.id));
  return rows.map((row) => ({ ...runOf(row), ...(counts.get(row.id) ?? { jobs: 0, done: 0, workedBy: [] }) }));
};

/**
 * The latest runs, newest first, each with its job and done counts. With a
 * status, only the runs in it: the scanner lists the sent ones.
 */
export async function listRuns(status?: RunStatus): Promise<RunSummary[]> {
  const query = companyOs.from("replenishment_runs").select(RUN_COLUMNS);
  const rows = mustRows(
    await (status ? query.eq("status", status) : query).order("uploaded_at", { ascending: false }).order("id").limit(LIST_LIMIT),
    `${TAG} list`,
  ) as RunRow[];
  return withCounts(rows);
}

/**
 * The runs of the same profile uploaded before `run`, newest first, with their
 * counts: the run page's "Earlier runs", where a manager sees whether rounds
 * are being finished.
 */
export async function earlierRuns(run: { profileId: string; uploadedAt: string }, limit = 5): Promise<RunSummary[]> {
  const rows = mustRows(
    await companyOs
      .from("replenishment_runs")
      .select(RUN_COLUMNS)
      .eq("profile_id", run.profileId)
      .lt("uploaded_at", run.uploadedAt)
      .order("uploaded_at", { ascending: false })
      .order("id")
      .limit(limit),
    `${TAG} earlier`,
  ) as RunRow[];
  return withCounts(rows);
}

/** One run with its left-out items and profile snapshot; null when there is none by that id. */
export async function readRun(id: string): Promise<RunDetail | null> {
  const { data, error } = await companyOs
    .from("replenishment_runs")
    .select(`${RUN_COLUMNS}, left_out, profile_snapshot`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ReadFailure(`${TAG} one`, error.message);
  if (!data) return null;
  const row = data as RunRow & { left_out: unknown; profile_snapshot: unknown };
  const snapshot = parseProfile(row.profile_snapshot);
  return {
    ...runOf(row),
    leftOut: Array.isArray(row.left_out) ? (row.left_out as LeftOut[]) : [],
    snapshot: snapshot.ok ? snapshot.profile : null,
  };
}

type JobRow = {
  id: string;
  position: number;
  item: string;
  description: string;
  rule_label: string;
  band_label: string;
  pick_total: number | string;
  reserve_total: number | string;
  move_text: string;
  collect: unknown;
  destinations: string[] | null;
  done_at: string | null;
  bin_used: string | null;
  done_by: string | null;
};

const JOB_COLUMNS = "id, position, item, description, rule_label, band_label, pick_total, reserve_total, move_text, collect, destinations, done_at, bin_used, done_by";

/** Every job of a run, in walking order. */
export async function jobsOfRun(runId: string): Promise<StoredJob[]> {
  const rows = await mustPages<JobRow>(`${TAG} jobs`, (from, to) =>
    companyOs.from("replenishment_jobs").select(JOB_COLUMNS).eq("run_id", runId).order("position").range(from, to),
  );
  return rows.map((row) => ({
    id: row.id,
    position: row.position,
    item: row.item,
    description: row.description,
    rule: row.rule_label,
    band: row.band_label,
    // numeric comes back as a number; String() prints it the way the engine did ("7.5", "12").
    pick: String(row.pick_total),
    reserve: String(row.reserve_total),
    move: row.move_text,
    collect: Array.isArray(row.collect) ? (row.collect as { location: string; qty: string }[]) : [],
    destinations: row.destinations ?? [],
    doneAt: row.done_at,
    binUsed: row.bin_used,
    doneBy: row.done_by,
  }));
}

/** What createRun hands the store: the run's own columns and the engine's jobs, in walking order. */
export type NewRun = {
  id: string;
  profileId: string;
  profileVersion: number;
  snapshot: Profile;
  fileName: string;
  storagePath: string;
  dataRows: number;
  truncated: boolean;
  leftOut: LeftOut[];
  uploadedBy: string | null;
  uploadedAt: string;
  jobs: Job[];
};

/**
 * Writes the run as a draft, then all its jobs in one insert, numbered from 1
 * in the engine's walking order. PostgREST gives the two inserts no shared
 * transaction, so when the jobs are refused the run is deleted again: a draft
 * with no jobs would read as "nothing to restock", which is a real answer. A
 * failed delete raises, naming the run, because only then is a row left.
 */
export async function writeRun(run: NewRun): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: runError } = await companyOs.from("replenishment_runs").insert({
    id: run.id,
    profile_id: run.profileId,
    profile_version: run.profileVersion,
    profile_snapshot: run.snapshot as unknown as Json,
    file_name: run.fileName,
    storage_path: run.storagePath,
    data_rows: run.dataRows,
    truncated: run.truncated,
    left_out: run.leftOut as unknown as Json,
    status: "draft",
    uploaded_by: run.uploadedBy,
    uploaded_at: run.uploadedAt,
  });
  if (runError) return { ok: false, error: runError.message };
  if (run.jobs.length === 0) return { ok: true };

  const { error: jobsError } = await companyOs.from("replenishment_jobs").insert(
    run.jobs.map((job, i) => ({
      run_id: run.id,
      position: i + 1,
      item: job.item,
      description: job.description,
      rule_label: job.rule,
      band_label: job.band,
      pick_total: Number(job.pick),
      reserve_total: Number(job.reserve),
      move_text: job.move,
      collect: job.collect as unknown as Json,
      destinations: job.destinations,
    })),
  );
  if (!jobsError) return { ok: true };
  const { error: undoError } = await companyOs.from("replenishment_runs").delete().eq("id", run.id);
  // Raised, not logged: a draft left with no jobs would show "nothing to
  // restock" to whoever opens it, so this is a failure someone must see.
  if (undoError) throw new Error(`${TAG} run ${run.id} was written without its jobs and could not be deleted again: ${undoError.message}`);
  return { ok: false, error: jobsError.message };
}

/**
 * Moves a run to `to` from one of `from`, stamping who and when. The update
 * names the statuses it may leave, so a second click, or a run another
 * manager moved a moment ago, matches no row. Answers whether a row moved.
 */
export async function moveRun(
  id: string,
  from: readonly RunStatus[],
  to: "sent" | "closed",
  by: string | null,
  at: string,
): Promise<{ ok: true; moved: boolean } | { ok: false; error: string }> {
  const stamp = to === "sent" ? { status: to, sent_at: at, sent_by: by } : { status: to, closed_at: at, closed_by: by };
  const { data, error } = await companyOs.from("replenishment_runs").update(stamp).eq("id", id).in("status", [...from]).select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, moved: ((data ?? []) as unknown[]).length > 0 };
}

/** The run a job belongs to and the run's status; null when there is no job by that id. */
export async function runOfJob(jobId: string): Promise<{ ok: true; run: { id: string; status: RunStatus } | null } | { ok: false; error: string }> {
  const { data: job, error: jobError } = await companyOs.from("replenishment_jobs").select("run_id").eq("id", jobId).maybeSingle();
  if (jobError) return { ok: false, error: jobError.message };
  if (!job) return { ok: true, run: null };
  const runId = (job as { run_id: string }).run_id;
  const { data: run, error: runError } = await companyOs.from("replenishment_runs").select("id, status").eq("id", runId).maybeSingle();
  if (runError) return { ok: false, error: runError.message };
  if (!run) return { ok: true, run: null };
  return { ok: true, run: { id: runId, status: (run as { status: string }).status as RunStatus } };
}

/**
 * Finishes a job (`done` given) or reopens it (`done` null). The three
 * columns are written together because the table refuses a job with only some
 * of them set. Finishing a job that is done already overwrites its BIN, so a
 * second scan corrects the first. Answers whether a row was written.
 */
export async function markJob(
  jobId: string,
  runId: string,
  done: { bin: string; at: string; by: string } | null,
): Promise<{ ok: true; written: boolean } | { ok: false; error: string }> {
  const columns = done ? { bin_used: done.bin, done_at: done.at, done_by: done.by } : { bin_used: null, done_at: null, done_by: null };
  const { data, error } = await companyOs.from("replenishment_jobs").update(columns).eq("id", jobId).eq("run_id", runId).select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, written: ((data ?? []) as unknown[]).length > 0 };
}

const exportsStore = () => supabase.storage.from(EXPORTS_BUCKET);

/** Keeps the uploaded export with the run, so a run can be explained later from its source. */
export async function storeExport(path: string, bytes: Uint8Array, contentType: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await exportsStore().upload(path, bytes, { contentType, upsert: false });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Removes an export whose run was never written. Best effort: a leftover object is logged, never shown. */
export async function discardExport(path: string): Promise<void> {
  const { error } = await exportsStore().remove([path]);
  if (error) console.error(`${TAG} could not remove ${path}: ${error.message}`);
}

/** The newest run of a profile, by upload, with where its export is kept. */
export type LatestRun = { id: string; fileName: string; uploadedAt: string; storagePath: string };

/**
 * The profile's newest run, whatever its status, which the profile editor's
 * preview recounts against; null when the profile has no run yet. A failed
 * read is answered as a failure, never as "no run": the editor would
 * otherwise say there is nothing to preview against.
 */
export async function latestRunOf(profileId: string): Promise<{ ok: true; run: LatestRun | null } | { ok: false; error: string }> {
  const { data, error } = await companyOs
    .from("replenishment_runs")
    .select("id, file_name, uploaded_at, storage_path")
    .eq("profile_id", profileId)
    .order("uploaded_at", { ascending: false })
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, run: null };
  const row = data as { id: string; file_name: string; uploaded_at: string; storage_path: string };
  return { ok: true, run: { id: row.id, fileName: row.file_name, uploadedAt: row.uploaded_at, storagePath: row.storage_path } };
}

/** The bytes of a kept export, or the bucket's refusal. */
export async function fetchExport(path: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  const { data, error } = await exportsStore().download(path);
  if (error || !data) return { ok: false, error: error?.message ?? "the bucket answered with no file" };
  return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()) };
}
