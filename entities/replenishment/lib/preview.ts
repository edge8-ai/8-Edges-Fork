import { buildRun, type Cell, type Job } from "./engine";
import type { Profile } from "./profile";

// The profile editor's preview (RP.6; spec stories 9, 22-24): what a draft
// profile would make of the last stored export, and where a typed BIN code
// would fall. It runs the engine itself, so the preview can never disagree
// with the run an upload would make. Pure, like the engine, so the editor runs
// it in the browser on every valid draft and it is tested without a page.

export type Preview = {
  dataRows: number;
  truncated: boolean;
  jobs: number;
  /** Jobs per band, indexed as the profile's rules and their bands: `bandJobs[rule][band]`. */
  bandJobs: number[][];
  leftOut: number;
  /** The left-out items grouped by reason, the commonest first. */
  reasons: { reason: string; count: number }[];
  /** The first jobs in walking order, as the operator will meet them. */
  firstJobs: Job[];
};

/** How many jobs the preview lists: enough to check the walking order and the amounts. */
const FIRST_JOBS = 6;

/**
 * The run `profile` would make of `table`, summed for the preview. A profile
 * whose column headings the export lacks is answered with the engine's own
 * sentence ("The export has no "Bin" column."), which is the preview's answer
 * for that draft rather than a fault.
 *
 * A job names its rule and band by label, so it is counted against the first
 * enabled rule with that label and that rule's first band with its label: the
 * engine decides by the first rule an item meets, and two rules sharing a
 * label is a manager's own ambiguity to fix.
 */
export function previewRun(profile: Profile, table: Cell[][]): { ok: true; preview: Preview } | { ok: false; error: string } {
  let run;
  try {
    run = buildRun(profile, table);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The export could not be read with this profile." };
  }
  const bandJobs = profile.rules.map((rule) => rule.bands.map(() => 0));
  for (const job of run.jobs) {
    const r = profile.rules.findIndex((rule) => rule.enabled && rule.label === job.rule);
    const b = r < 0 ? -1 : profile.rules[r].bands.findIndex((band) => band.label === job.band);
    if (b >= 0) bandJobs[r][b] += 1;
  }
  const byReason = new Map<string, number>();
  for (const item of run.leftOut) byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
  const reasons = [...byReason]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));
  return {
    ok: true,
    preview: {
      dataRows: run.dataRows,
      truncated: run.truncated,
      jobs: run.jobs.length,
      bandJobs,
      leftOut: run.leftOut.length,
      reasons,
      firstJobs: run.jobs.slice(0, FIRST_JOBS),
    },
  };
}

/** How the draft's job count compares with the saved profile's, against the same export (story 23). */
export function jobsChange(draft: number, saved: number): string {
  const diff = draft - saved;
  if (diff === 0) return "Same as the saved profile.";
  return diff > 0 ? `${diff} more than the saved profile.` : `${-diff} fewer than the saved profile.`;
}

/**
 * Where a typed BIN code falls (story 9): the first zone whose pattern it
 * matches, as the engine places it, with the walk parts read from the code. A
 * zone whose pattern does not compile is reported rather than skipped, so a
 * typo is seen here before it empties a run.
 */
export function tryLocation(zones: Profile["zones"], code: string): { ok: boolean; text: string } {
  const location = code.trim();
  if (location === "") return { ok: false, text: "Type a BIN code to see which zone it falls in." };
  for (const zone of zones) {
    let match: RegExpExecArray | null;
    try {
      match = new RegExp(zone.pattern).exec(location);
    } catch {
      return { ok: false, text: `${zone.label || "A zone"}: the pattern has an error` };
    }
    if (!match) continue;
    const parts = zone.walk.map((group) => {
      const value = match.groups?.[group];
      return `${group} ${value === undefined || value === "" ? "none" : Number.isNaN(Number(value)) ? value : Number(value)}`;
    });
    return { ok: true, text: `${zone.label} (${zone.role})${parts.length > 0 ? ` · ${parts.join(", ")}` : ""}` };
  }
  return { ok: false, text: "Ignored: fits no zone" };
}
