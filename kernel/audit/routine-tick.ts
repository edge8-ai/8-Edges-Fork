import { randomUUID } from "node:crypto";
import vercelConfig from "@/vercel.json";

// The tick a run claims (plan B2, "the tick key"). A cron's tick is the
// schedule slot the invocation belongs to: the latest slot of its declared cron
// expression at or before now, in UTC, formatted by cadence — YYYY-MM-DD for a
// cron that fires at most daily, YYYY-MM-DDTHH for an hourly one,
// YYYY-MM-DDTHH:MM for one that fires more than hourly, and YYYY-Www for one
// fixed day a week. A late fire maps to its own slot, not the next one. Only
// Vercel Cron's own delivery claims a slot. Work with no schedule (a button, an
// on-demand route, a step of an agent run), and any other request to a
// scheduled route (the runbook's curl, the Mac mini's in-process call, a manual
// POST), claims a fresh UUID, so it never collides with anything.
//
// The schedule is read from vercel.json, the file the deployment generator
// writes from each routine's own `schedule` export, because the routine id is
// the cron path in that file and the kernel may not import the entities that
// declare it.

type Field = { values: Set<number>; star: boolean };

const RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week, 0 and 7 both Sunday
];

function parseField(text: string, [lo, hi]: [number, number]): Field | null {
  const values = new Set<number>();
  for (const part of text.split(",")) {
    const m = part.match(/^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/);
    if (!m) return null;
    const from = m[1] === "*" ? lo : Number(m[2]);
    const to = m[1] === "*" ? hi : m[3] !== undefined ? Number(m[3]) : m[4] !== undefined ? hi : from;
    const step = m[4] !== undefined ? Number(m[4]) : 1;
    if (from < lo || to > hi || from > to || step < 1) return null;
    for (let v = from; v <= to; v += step) values.add(v);
  }
  if (values.has(7)) values.add(0);
  return { values, star: text === "*" };
}

type Cron = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field };

function parseCron(expr: string): Cron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields = parts.map((p, i) => parseField(p, RANGES[i]));
  if (fields.some((f) => f === null)) return null;
  const [minute, hour, dom, month, dow] = fields as Field[];
  return { minute, hour, dom, month, dow };
}

function matches(c: Cron, d: Date): boolean {
  if (!c.minute.values.has(d.getUTCMinutes()) || !c.hour.values.has(d.getUTCHours())) return false;
  if (!c.month.values.has(d.getUTCMonth() + 1)) return false;
  const domOk = c.dom.values.has(d.getUTCDate());
  const dowOk = c.dow.values.has(d.getUTCDay());
  // Standard cron: when both day fields are restricted, either one matching is enough.
  if (!c.dom.star && !c.dow.star) return domOk || dowOk;
  return domOk && dowOk;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // the Thursday of this ISO week names its year
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

function format(c: Cron, slot: Date): string {
  const date = `${slot.getUTCFullYear()}-${pad(slot.getUTCMonth() + 1)}-${pad(slot.getUTCDate())}`;
  if (c.minute.values.size > 1) return `${date}T${pad(slot.getUTCHours())}:${pad(slot.getUTCMinutes())}`;
  if (c.hour.values.size > 1) return `${date}T${pad(slot.getUTCHours())}`;
  const oneWeekday = c.dom.star && c.month.star && new Set([...c.dow.values].map((v) => v % 7)).size === 1;
  return oneWeekday ? isoWeek(slot) : date;
}

// The longest gap any cron expression we accept can leave between slots is a
// month and a day; walking back minute by minute over that is cheap.
const LOOKBACK_MINUTES = 32 * 1440;

/** The tick key for a cron expression at `now`, or null when it cannot be read or has no recent slot. */
export function tickKeyFor(cron: string, now: Date = new Date()): string | null {
  const c = parseCron(cron);
  if (!c) return null;
  const t = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  for (let i = 0; i <= LOOKBACK_MINUTES; i++) {
    if (matches(c, t)) return format(c, t);
    t.setTime(t.getTime() - 60_000);
  }
  return null;
}

/** The cron expression vercel.json schedules this routine on, or null for on-demand work. */
export function scheduleFor(routineId: string): string | null {
  const crons = ((vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? []);
  return crons.find((c) => c.path === routineId)?.schedule ?? null;
}

/** The tick a routine claims now: its schedule slot when it has a schedule, a fresh UUID otherwise. */
function currentTick(routineId: string, now: Date): string {
  const cron = scheduleFor(routineId);
  return (cron && tickKeyFor(cron, now)) || randomUUID();
}

/**
 * The header Vercel Cron puts on every delivery: the cron expression that fired
 * it (Vercel docs, "Managing Cron Jobs"). It is what tells the schedule's own
 * delivery from anyone else calling the same path with the same bearer.
 */
const VERCEL_CRON_SCHEDULE = "x-vercel-cron-schedule";

/**
 * The tick one request to a routine claims. Only a delivery of the schedule
 * belongs to a schedule slot, and Vercel Cron delivers one as a GET carrying
 * x-vercel-cron-schedule (Next answers a HEAD with the same handler). That is
 * the request Vercel may send twice, so it is the one the slot deduplicates.
 *
 * Every other request with the bearer is someone asking for the work outside
 * the schedule and claims a fresh UUID, as a button does: the runbook's curl
 * GET, the office Mac mini's nightly job calling htt-sync-prs' GET in-process
 * (scripts/htt/run-pr-sync.mts) because the hosted cron lacks its secrets, the
 * POST aliases the htt crons keep, and htt-refresh-summaries' POST that
 * force-regenerates one repo's summary. Keyed by the slot, each of them found
 * the slot's run already holding the tick, even one that had only skipped, and
 * answered tick-taken with a 200 and without doing the work: a re-run after a
 * failed monthly recap was refused until the next month, and the Mac mini's
 * sync reported ok every night while syncing nothing. The method alone could
 * not tell them apart, because the curl and the Mac mini send a GET too.
 */
export function tickForRequest(routineId: string, req: Request, now: Date = new Date()): string {
  const read = req.method === "GET" || req.method === "HEAD";
  const scheduled = read && req.headers.has(VERCEL_CRON_SCHEDULE);
  return scheduled ? currentTick(routineId, now) : randomUUID();
}
