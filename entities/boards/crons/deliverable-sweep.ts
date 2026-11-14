import { failuresFrom, routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { mustRows } from "@/kernel/data/read";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { DELIVERABLES_BUCKET } from "@/entities/boards/lib/deliverable-rules";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
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
  name: "Deliverable sweep",
  description: "Daily at 02:40. Keeps the card-attachments bucket to what cards hold: uploads never confirmed after a day, deliverables archived over 30 days ago, and the files of cards deleted outright. A failed read deletes nothing.",
  content: ["Board cards", "Deliverables"],
  apps: ["Supabase"],
};

// Vercel cron (see vercel.json): daily 19:40 UTC (02:40 Asia/Ho_Chi_Minh),
// when nobody is uploading. The card-attachments bucket's housekeeping (W.157):
//
//  1. Uploads never confirmed, older than a day: the browser stopped before the
//     confirm action ran, or confirm refused and its own clean-up failed.
//  2. FILE deliverables archived more than 30 days ago: long past the toast's
//     undo, so the object is purged and the row with it. An archived LINK row
//     has no object and stays as the card's history (bug hunt B9, W.163).
//  3. Folders whose card is gone (db-review on #1785): a card or board deleted
//     outright cascades its task_attachments rows away but leaves the objects,
//     and a sweep that finds objects through rows can never reach those.
//  4. Stray objects in a LIVE card's folder (bug hunt K1, W.163): an object
//     older than a day that no task_attachments row names. A signed upload
//     token lives two hours, so after a refused upload is discarded the same
//     browser can upload to that path again, and nothing else would find it.
//
// Reads are must-reads: a failed read stops its own pass, the run is recorded
// as an error, and NOTHING is deleted on the strength of an answer that was not
// given. Each pass runs on its own (bug hunt F6): a pass that throws is named
// in `failed` and the counts of the passes that ran stay in the result. An
// object is removed before its row, and a row is deleted only when its object
// removal succeeded, so a failed removal leaves the row for the next night.

const ROUTINE_ID = "/api/cron/deliverable-sweep/";
const DAY_MS = 24 * 60 * 60 * 1000;
/** Storage removes at most this many objects per call, and lists at most this many per page. */
const STORAGE_PAGE = 1000;
/** A run's ceiling per row pass, so one bad night cannot run the function out. */
const MAX_ROWS = 2000;
/** Ids or paths per `.in()` read, so the query string stays short. */
const IN_CHUNK = 100;
/**
 * Live card folders whose objects one run looks inside (pass 4). Each costs a
 * listing and a row read, so a night checks a window of them and the window
 * moves on by day: every folder is reached within ceil(folders / 200) nights.
 */
const STRAY_FOLDERS_PER_RUN = 200;
/**
 * The folder passes stop starting new work after this long, inside the
 * route's 60-second maxDuration (entities/boards/mounts.ts), so the run can
 * still answer with what it did.
 */
const FOLDER_BUDGET_MS = 40_000;
/**
 * A card folder is named by the card's id. Only a canonical UUID is a card
 * folder; anything else in `task/` is left alone, because it names no card
 * this sweep could check (bug hunt F4).
 */
const CARD_FOLDER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PathRow = { id: string; storage_path: string | null };
type StoredObject = { path: string; createdAt: number | null };

/** What the run did, built up as it goes so a later failure cannot erase it. */
type Report = {
  unconfirmed: number;
  archived: number;
  orphanedObjects: number;
  strayObjects: number;
  folders: number;
  foldersChecked: number;
  failed: string[];
};

const bucket = () => supabase.storage.from(DELIVERABLES_BUCKET);
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs one pass; a throw is recorded under the pass's name and the run goes on. */
async function pass(report: Report, name: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (err) {
    console.error(`[deliverable-sweep] ${name}`, messageOf(err));
    report.failed.push(`${name}: ${messageOf(err)}`);
  }
}

/**
 * The condition a purge was selected by, applied again to its delete (bug hunt
 * F5), so a row that changed after it was read (confirmed, or restored) is
 * kept rather than deleted on a stale answer.
 */
type Selection = { kind: "unconfirmed"; createdBefore: string } | { kind: "archived"; archivedBefore: string };

/** Deletes rows that still meet their selection; returns how many went. */
async function deleteRows(ids: string[], selection: Selection, report: Report): Promise<number> {
  const base = companyOs.from("task_attachments").delete().in("id", ids);
  const recheck =
    selection.kind === "unconfirmed"
      ? base.is("confirmed_at", null).lt("created_at", selection.createdBefore)
      : base.eq("kind", "file").lt("archived_at", selection.archivedBefore);
  // Asking for the deleted rows back is what makes a delete that matched
  // nothing visible; without it the count would claim rows that stayed.
  const { data, error } = await recheck.select("id");
  if (error) {
    report.failed.push(`${selection.kind} rows: ${error.message}`);
    return 0;
  }
  const gone = (data ?? []).length;
  if (gone < ids.length) report.failed.push(`${selection.kind} rows: ${ids.length - gone} changed after they were read and were kept`);
  return gone;
}

/** Removes objects and then their rows; returns how many rows went. */
async function purge(rows: PathRow[], selection: Selection, report: Report): Promise<number> {
  let removed = 0;
  for (const batch of chunks(rows, STORAGE_PAGE)) {
    const paths = batch.map((r) => r.storage_path).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error } = await bucket().remove(paths);
      if (error) {
        report.failed.push(`${selection.kind} objects: ${error.message}`);
        continue;
      }
    }
    // The rows go in short slices: a storage page holds up to 1000 paths, and
    // 1000 ids in one `.in()` would make the request too long to send.
    for (const ids of chunks(batch.map((r) => r.id), IN_CHUNK)) {
      removed += await deleteRows(ids, selection, report);
    }
  }
  return removed;
}

/**
 * Every card folder in the bucket, by name in name order. Paged to the end
 * (bug hunt B8): a folder past any fixed count was never checked.
 */
async function cardFolders(deadline: number): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    if (Date.now() > deadline) throw new Error(`listing card folders ran out of time after ${offset}`);
    const { data, error } = await bucket().list("task", { limit: STORAGE_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listing card folders: ${error.message}`);
    const page = data ?? [];
    for (const f of page) if (CARD_FOLDER.test(f.name)) names.push(f.name);
    if (page.length < STORAGE_PAGE) return names;
  }
}

/**
 * The folders whose card still exists. A card id is a uuid, which Postgres
 * compares without regard to case, so a folder spelled in capitals names the
 * same card and is live (bug hunt F4): comparing bytes once called such a
 * folder an orphan and deleted its confirmed files.
 */
async function liveFolders(names: string[]): Promise<Set<string>> {
  const live = new Set<string>();
  for (const chunk of chunks(names, IN_CHUNK)) {
    const rows = mustRows(
      await companyOs.from("tasks").select("id").in("id", chunk.map((n) => n.toLowerCase())),
      "cards behind the attachment folders",
    );
    const ids = new Set(rows.map((t) => String(t.id).toLowerCase()));
    for (const n of chunk) if (ids.has(n.toLowerCase())) live.add(n);
  }
  return live;
}

/** Every object in one card folder, paged past a thousand (bug hunt B12). */
async function folderObjects(folder: string): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await bucket().list(`task/${folder}`, { limit: STORAGE_PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listing ${folder}: ${error.message}`);
    const page = data ?? [];
    for (const f of page) {
      // A null id is a sub-folder, which no upload writes; leave it alone.
      if (f.id === null) continue;
      const at = f.created_at ? Date.parse(f.created_at) : NaN;
      objects.push({ path: `task/${folder}/${f.name}`, createdAt: Number.isNaN(at) ? null : at });
    }
    if (page.length < STORAGE_PAGE) return objects;
  }
}

/** Removes paths in storage-sized batches; returns how many went. */
async function removeAll(paths: string[], label: string, report: Report): Promise<number> {
  let removed = 0;
  for (const batch of chunks(paths, STORAGE_PAGE)) {
    const { error } = await bucket().remove(batch);
    if (error) report.failed.push(`${label}: ${error.message}`);
    else removed += batch.length;
  }
  return removed;
}

/**
 * The live folders this night looks inside: all of them when they fit, or a
 * window that moves on by a window's width each day, so no folder waits for
 * ever behind the ones before it.
 */
function strayWindow(live: string[], now: number): string[] {
  if (live.length <= STRAY_FOLDERS_PER_RUN) return live;
  const start = (Math.floor(now / DAY_MS) * STRAY_FOLDERS_PER_RUN) % live.length;
  return [...live.slice(start), ...live.slice(0, start)].slice(0, STRAY_FOLDERS_PER_RUN);
}

/** Objects in a live card's folder, older than a day, that no row names. */
async function strayObjects(folder: string, now: number): Promise<string[]> {
  const old = (await folderObjects(folder)).filter((o) => o.createdAt !== null && o.createdAt < now - DAY_MS).map((o) => o.path);
  if (old.length === 0) return [];
  const known = new Set<string>();
  for (const chunk of chunks(old, IN_CHUNK)) {
    // Any row at all keeps its object: unconfirmed and archived rows have
    // passes of their own, which remove object and row together.
    const rows = mustRows(
      await companyOs.from("task_attachments").select("storage_path").in("storage_path", chunk),
      `deliverable rows for ${folder}`,
    );
    for (const r of rows) if (r.storage_path) known.add(r.storage_path);
  }
  return old.filter((p) => !known.has(p));
}

async function handler(_req: Request) {
  const now = Date.now();
  const deadline = now + FOLDER_BUDGET_MS;
  const report: Report = { unconfirmed: 0, archived: 0, orphanedObjects: 0, strayObjects: 0, folders: 0, foldersChecked: 0, failed: [] };

  await pass(report, "unconfirmed uploads", async () => {
    const createdBefore = new Date(now - DAY_MS).toISOString();
    const stale = mustRows(
      await companyOs
        .from("task_attachments")
        .select("id, storage_path")
        .is("confirmed_at", null)
        .lt("created_at", createdBefore)
        .limit(MAX_ROWS),
      "unconfirmed uploads older than a day",
    ) as PathRow[];
    report.unconfirmed = await purge(stale, { kind: "unconfirmed", createdBefore }, report);
  });

  await pass(report, "archived deliverables", async () => {
    const archivedBefore = new Date(now - 30 * DAY_MS).toISOString();
    const expired = mustRows(
      await companyOs
        .from("task_attachments")
        .select("id, storage_path")
        .eq("kind", "file")
        .not("archived_at", "is", null)
        .lt("archived_at", archivedBefore)
        .limit(MAX_ROWS),
      "file deliverables archived over 30 days ago",
    ) as PathRow[];
    report.archived = await purge(expired, { kind: "archived", archivedBefore }, report);
  });

  let live: string[] = [];
  await pass(report, "card folders", async () => {
    const names = await cardFolders(deadline);
    report.folders = names.length;
    const alive = await liveFolders(names);
    live = names.filter((n) => alive.has(n));
    for (const folder of names) {
      if (alive.has(folder)) continue;
      if (Date.now() > deadline) throw new Error("ran out of time before every gone card's folder was emptied");
      try {
        const paths = (await folderObjects(folder)).map((o) => o.path);
        report.orphanedObjects += await removeAll(paths, `gone card ${folder}`, report);
      } catch (err) {
        report.failed.push(`card folders: ${messageOf(err)}`);
      }
    }
  });

  await pass(report, "stray objects", async () => {
    for (const folder of strayWindow(live, now)) {
      if (Date.now() > deadline) throw new Error(`ran out of time after ${report.foldersChecked} folders`);
      // One folder's failed read is that folder's problem: it is named, it
      // keeps everything, and the folders after it are still checked. The
      // gone-card loop above does the same.
      try {
        const strays = await strayObjects(folder, now);
        report.strayObjects += await removeAll(strays, `strays in ${folder}`, report);
        report.foldersChecked += 1;
      } catch (err) {
        report.failed.push(`stray objects: ${messageOf(err)}`);
      }
    }
  });

  // `failed` stays in the body as the counter it always was; the same lines
  // become failures, so the kernel makes the run an error that names the pass
  // or the objects that went wrong (Y.20).
  return routineResult({ status: "ok", ...report, failures: failuresFrom(report.failed, "sweep", "deliverable sweep") });
}

export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
