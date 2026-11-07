// What a run's page says about it (RP.4): the checks a manager reads before
// sending, the job count of every band, and the run's day and status in words.
// Pure, so the page's sentences are tested without rendering it.
import { BUSINESS_TIME_ZONE } from "@/kernel/config/dates";
import type { Profile } from "./profile";
import type { RunStatus } from "./run-store";

export type Check = { ok: boolean; text: string };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * The checks the upload already passed or flags. A run exists only when every
 * column was found, so that one is always true; the row count carries the
 * truncation warning, which is the one check that can fail on a stored run.
 */
export function runChecks(run: { dataRows: number; truncated: boolean; leftOut: readonly unknown[] }, words: { reserve: string }): Check[] {
  return [
    { ok: true, text: "All four columns found" },
    run.truncated
      ? { ok: false, text: `Only ${plural(run.dataRows, "row", "rows")}: the export may have been cut off. Export it again before sending.` }
      : { ok: true, text: `${plural(run.dataRows, "row", "rows")} read, so not cut off` },
    run.leftOut.length === 0
      ? { ok: true, text: `Every item held in ${words.reserve} was read` }
      : { ok: true, text: `${plural(run.leftOut.length, "item", "items")} held in ${words.reserve} left out, each with its reason` },
    { ok: true, text: "Every location outside the zones ignored" },
  ];
}

export type BandCount = { label: string; jobs: number };

/**
 * How many jobs each band produced, in the profile's own order, every enabled
 * band listed even at zero, so a band that suddenly produced nothing stands
 * out against last week. A job whose rule and band the snapshot no longer
 * names (it cannot happen for a run built from that snapshot) is still counted.
 */
export function bandCounts(snapshot: Profile | null, jobs: readonly { rule: string; band: string }[]): BandCount[] {
  const key = (rule: string, band: string) => `${rule}\u0000${band}`;
  const counts = new Map<string, BandCount>();
  for (const rule of snapshot?.rules ?? []) {
    if (!rule.enabled) continue;
    for (const band of rule.bands) counts.set(key(rule.label, band.label), { label: `${rule.label} ${band.label}`, jobs: 0 });
  }
  for (const job of jobs) {
    const k = key(job.rule, job.band);
    const c = counts.get(k) ?? { label: `${job.rule} ${job.band}`, jobs: 0 };
    c.jobs += 1;
    counts.set(k, c);
  }
  return [...counts.values()];
}

/** "Thursday 29 Oct", in the business time zone, the day a run is known by. */
export function runDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });
}

/** "8:02", in the business time zone. */
export function runTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE });
}

/** The status in the words the run board uses, and the badge tone that goes with it. */
export function statusWords(status: RunStatus): { text: string; tone: "warn" | "ok" | "neutral" } {
  if (status === "draft") return { text: "Draft: scanners can't see it yet", tone: "warn" };
  if (status === "sent") return { text: "Sent to scanners", tone: "ok" };
  return { text: "Closed", tone: "neutral" };
}

/** The words a run uses for its two kinds of BIN: its snapshot's, or plain ones when the snapshot cannot be read. */
export function binWords(snapshot: Profile | null): { pick: string; reserve: string } {
  return { pick: snapshot?.words.pick ?? "Pick", reserve: snapshot?.words.reserve ?? "Reserve" };
}

/** "29 Oct", in the business time zone: the scanner's short name for a run. */
export function runDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });
}

/** "Thu 29 Oct", in the business time zone: the day under the operator's name. */
export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE });
}

/**
 * Plain words for a run whose snapshot no longer passes the schema. A run is
 * built only from a valid profile, so this is for a later schema change; the
 * scanner must still work its jobs then.
 */
const PLAIN_WORDS: Profile["words"] = {
  pick: "Pick",
  reserve: "Reserve",
  instructions: ["Work through the jobs in order. Move the amount shown from the listed locations to a pick BIN, and scan the BIN you used."],
  destinationRule: "Start with Destination 1. If it is full, try the next one.",
  noPickNote: "This item has no pick BIN yet. Use any free BIN in its zone.",
  choiceHint: "Choose the amount at the shelf.",
  footer: null,
};

/** The words the scanner shows for a run: its snapshot's own, so a profile edit never changes a run being worked. */
export function operatorWords(snapshot: Profile | null): Profile["words"] {
  return snapshot?.words ?? PLAIN_WORDS;
}

// ── Tracking a run (RP.7): who finished each job, when, and with which BIN ──

/** The jobs the run page lists: every one, or only the open or the done ones. */
export type JobsFilter = "open" | "done";

/** The filter a `?jobs=` value names; anything else lists every job. */
export function jobsFilterOf(value: string | undefined): JobsFilter | null {
  return value === "open" || value === "done" ? value : null;
}

/** The jobs a filter keeps, still in walking order. */
export function jobsShown<J extends { doneAt: string | null }>(jobs: readonly J[], filter: JobsFilter | null): J[] {
  if (filter === null) return [...jobs];
  return jobs.filter((job) => (filter === "done") === (job.doneAt !== null));
}

/**
 * How far a run's round has got. `step` is the share done in tens, rounded
 * down so a bar never reads full while a job is open: what the admin progress
 * bar draws (`.admin-progress-fill[data-p]`).
 */
export function jobProgress(jobs: readonly { doneAt: string | null }[]): { total: number; done: number; open: number; step: number } {
  const total = jobs.length;
  const done = jobs.filter((job) => job.doneAt !== null).length;
  const step = total === 0 ? 0 : done === total ? 100 : Math.floor((done / total) * 10) * 10;
  return { total, done, open: total - done, step };
}

/** A person's name as a record shows it, or plain words when nobody by that id is on record. */
const nameOf = (people: ReadonlyMap<string, { name: string }>, id: string) => people.get(id)?.name ?? "Someone no longer on record";

/** Who finished a job, when and with which BIN; null while it is open. */
export function finishedBy(
  job: { doneAt: string | null; binUsed: string | null; doneBy: string | null },
  people: ReadonlyMap<string, { name: string }>,
): { bin: string; who: string; when: string } | null {
  if (job.doneAt === null) return null;
  return {
    bin: job.binUsed ?? "",
    who: job.doneBy === null ? "Someone no longer on record" : nameOf(people, job.doneBy),
    when: `${shortDay(job.doneAt)}, ${runTime(job.doneAt)}`,
  };
}

/** "Dana Pham, Sam Nguyen": who worked a run, most jobs first, or a dash when nobody has yet. */
export function workedByWords(ids: readonly string[], people: ReadonlyMap<string, { name: string }>): string {
  return ids.length === 0 ? "—" : ids.map((id) => nameOf(people, id)).join(", ");
}
