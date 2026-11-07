import type { EffectKind, EffectRow } from "@/kernel/audit/effects";
import type { RoutineSwitch } from "@/kernel/audit/routine-config";
import type { RecentRun, RoutineRunStatus } from "@/kernel/audit/routine-runs";
import { BUSINESS_TIME_ZONE, isoWeekKey, isoWeekMonday, saigonToday } from "@/kernel/config/dates";
import type { Routine } from "./agent-management";

// Settings -> Agents v2 (Y.25): what each routine is doing now, from its
// definition, its newest runs, its switch and what it sent. Pure, so the
// rules that decide what a person reads first are tested without a database.
// Every string is formatted here, on the server, in business time, so the
// browser renders the same text the server did.

export type Tone = "ok" | "warn" | "err" | "info" | "muted";
export type LiveState = "running" | "waiting" | "off" | "shadow" | "died" | "error-twice" | "error" | "look" | "ok" | "skipped" | "never";
/** Where the switch stands (Z.17): shadow only for a routine that declares it. */
export type SwitchMode = "live" | "shadow" | "off";
export type RunLine = { id: string; word: string; tone: Tone; at: string; text: string };
export type SendLine = { id: string; word: string; tone: Tone; what: string; unknown: boolean; hint: string | null };

export type AgentRow = {
  id: string;
  name: string;
  /** Schedule, host and the last run, in one line. */
  meta: string;
  state: LiveState;
  pill: string;
  tone: Tone;
  /** What it is doing now, in a sentence. */
  now: string;
  off: boolean;
  mode: SwitchMode;
  canPause: boolean;
  /** The switch offers Shadow as well as Live and Off (Z.17). */
  canShadow: boolean;
  canRun: boolean;
  /** What a run now will do, for the confirmation. */
  runNote: string;
  runs: RunLine[];
  sends: SendLine[];
  /** An error, a died run or a send nobody can vouch for. */
  needsLook: boolean;
  /** Running or waiting. */
  busy: boolean;
};

const PILL: Record<LiveState, [string, Tone]> = {
  "error-twice": ["Error twice", "err"],
  error: ["Error", "err"],
  died: ["Died", "err"],
  look: ["Needs a look", "warn"],
  running: ["Running", "info"],
  waiting: ["Waiting", "info"],
  shadow: ["Shadow", "info"],
  off: ["Off", "muted"],
  skipped: ["Skipped", "muted"],
  ok: ["OK", "ok"],
  never: ["Never run", "muted"],
};

// Needing attention first, then what is in motion, then what is quiet.
const RANK: Record<LiveState, number> = {
  "error-twice": 0,
  died: 1,
  error: 2,
  look: 3,
  running: 4,
  waiting: 5,
  shadow: 6,
  off: 7,
  skipped: 8,
  ok: 9,
  never: 10,
};

const RUN_WORD: Record<RoutineRunStatus, [string, Tone]> = {
  ok: ["OK", "ok"],
  skipped: ["Skipped", "muted"],
  error: ["Error", "err"],
  running: ["Running", "info"],
  waiting: ["Waiting", "info"],
  died: ["Died", "err"],
};

const SEND_WORD: Record<EffectRow["status"], [string, Tone]> = {
  done: ["Sent", "ok"],
  unknown: ["Unknown", "warn"],
  released: ["Retry", "info"],
  claimed: ["Sending", "info"],
  shadow: ["Would send", "muted"],
};

const KIND: Record<EffectKind, string> = { lark: "Lark", publish: "Publish", webhook: "Webhook" };
const UNKNOWN_HINT: Record<EffectKind, string> = {
  lark: "The run ended before Lark answered. Check the chat or DM, then say:",
  publish: "The run ended before the publish was confirmed. Check the page, then say:",
  webhook: "The run ended before the webhook answered. Check the receiving end, then say:",
};

/** The badge for a tone: the base badge is already the muted one. */
export function badgeClass(tone: Tone): string {
  return tone === "muted" ? "admin-badge admin-agents-pill" : `admin-badge admin-badge--${tone} admin-agents-pill`;
}

/** How many runs each row lists; "failed twice in a row" needs two of them. */
export const RUNS_PER_ROUTINE = 5;

const AT = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const CLOCK_S = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TIME_ZONE, day: "numeric", month: "short" });

const at = (iso: string) => AT.format(new Date(iso));

/** At most `max` characters, cut with an ellipsis; the routine's own page has the rest. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** First line, ending in a full stop, or cut at 200 characters with an ellipsis. */
function sentence(text: string): string {
  const line = clip(text.split("\n")[0].trim(), 200);
  return /[.!?…]$/.test(line) ? line : `${line}.`;
}

/**
 * The start of this week in business time (Monday 00:00 in Ho Chi Minh City,
 * which keeps +07:00 all year): the window "What it sent this week" reads, and
 * the period the effect keys name (ideas:nudge:<person>:2026-W41).
 */
export function businessWeekStart(): Date {
  const monday = isoWeekMonday(isoWeekKey(saigonToday()));
  return new Date(`${monday}T00:00:00+07:00`);
}

function stateOf(runs: RecentRun[], sw: RoutineSwitch | undefined, unknown: number): LiveState {
  const [latest, previous] = runs;
  if (latest?.status === "running" || latest?.status === "waiting") return latest.status;
  if (sw?.paused) return "off";
  if (latest?.status === "died") return "died";
  if (latest?.status === "error") return previous?.status === "error" ? "error-twice" : "error";
  if (unknown > 0) return "look";
  if (sw?.mode === "shadow") return "shadow";
  if (!latest) return "never";
  return latest.status;
}

function nowLine(state: LiveState, r: Routine, runs: RecentRun[], sw: RoutineSwitch | undefined, unknown: number): string {
  const latest = runs[0];
  const failure = latest ? (latest.error ?? latest.summary ?? "no reason recorded") : "";
  switch (state) {
    case "running": {
      const due = latest.step_deadline_at ? ` Its step must finish by ${CLOCK.format(new Date(latest.step_deadline_at))}; the reaper marks it died a minute after.` : "";
      return `Running since ${CLOCK_S.format(new Date(latest.started_at))}.${due}`;
    }
    case "waiting":
      return latest.summary ? `Waiting: ${sentence(latest.summary)}` : "Waiting on a person or a timed send.";
    case "off": {
      const since = sw ? ` since ${DAY.format(new Date(sw.updatedAt))}${sw.updatedBy ? `, by ${sw.updatedBy}` : ""}` : "";
      const then = r.controls.runNow
        ? "Scheduled runs are recorded as skipped with this reason; Run now still works."
        : "Its runs are held until it is on again.";
      return `Off${since}: ${sentence(sw?.reason ?? "paused")} ${then}`;
    }
    case "shadow": {
      const since = sw ? ` since ${DAY.format(new Date(sw.updatedAt))}${sw.updatedBy ? `, by ${sw.updatedBy}` : ""}` : "";
      // Set by hand on a routine that cannot honour it: the kernel skips its
      // scheduled runs rather than let it send for real (decideRunMode).
      if (!r.controls.shadow) return `Set to shadow${since}, which it does not support, so its scheduled runs are skipped. Turn it on or off.`;
      const last = latest ? ` Last run: ${sentence(latest.summary ?? RUN_WORD[latest.status][0])}` : "";
      return `In shadow${since}: it runs and records what it would have sent, and sends nothing.${last}`;
    }
    case "died":
      return `Died: the run that started ${at(latest.started_at)} was killed before it could finish. Read the route's logs in Vercel for that minute.`;
    case "error-twice":
      return `Error twice in a row: ${sentence(failure)}`;
    case "error":
      return `Error: ${sentence(failure)}`;
    case "look": {
      const last = latest ? RUN_WORD[latest.status][0] : "No run yet";
      return unknown === 1
        ? `${last}, but one send may or may not have gone out. It will not be sent again until you say.`
        : `${last}, but ${unknown} sends may or may not have gone out. None will be sent again until you say.`;
    }
    case "ok":
      return latest.summary ? `OK: ${sentence(latest.summary)}` : "OK.";
    case "skipped":
      return `Skipped: ${sentence(latest.summary ?? "nothing to do")}`;
    case "never":
      return r.cron ? "Never run. Its first run appears here after its next scheduled slot." : "Never run. It runs when something starts it.";
  }
}

function runNote(r: Routine, sends: EffectRow[], sw: RoutineSwitch | undefined): string {
  const parts = [`Runs ${r.name} now, in a tick of its own, so its next scheduled run still happens.`];
  const done = sends.filter((s) => s.status === "done").length;
  if (done > 0) parts.push(`Sends already done this week are skipped by their keys (${done} so far), so nobody hears twice.`);
  const unknown = sends.filter((s) => s.status === "unknown").length;
  if (unknown > 0) parts.push(`${unknown === 1 ? "The unknown send stays" : `The ${unknown} unknown sends stay`} unsent until you settle ${unknown === 1 ? "it" : "them"} below.`);
  const reach = r.apps.filter((a) => a !== "Supabase");
  if (reach.length > 0) parts.push(`It talks to ${reach.join(", ")}.`);
  if (sw?.paused) parts.push("It is off: this runs it once and leaves it off.");
  if (sw?.mode === "shadow") {
    parts.push(
      r.controls.shadow
        ? "It is in shadow: this run records what it would send and sends nothing."
        : "It is set to shadow, which it does not support, so this run will be skipped. Turn it on or off first.",
    );
  }
  return parts.join(" ");
}

/** Every routine as the page shows it, needing attention first, registry order within a state. */
export function buildAgentRows(input: {
  routines: Routine[];
  runs: Map<string, RecentRun[]>;
  switches: Map<string, RoutineSwitch>;
  effects: EffectRow[];
  tokens: (routineId: string) => string | null;
}): AgentRow[] {
  const rows = input.routines.map((r, index) => {
    const runs = input.runs.get(r.id) ?? [];
    const sw = input.switches.get(r.id);
    const sends = input.effects.filter((e) => e.routine_id === r.id);
    const unknown = sends.filter((s) => s.status === "unknown").length;
    const state = stateOf(runs, sw, unknown);
    const [pill, tone] = PILL[state];
    const tokens = input.tokens(r.id);
    const meta = [r.schedule, r.host === "vercel" ? "Vercel" : "Mac mini", runs[0] ? `last run ${at(runs[0].started_at)}` : null, tokens]
      .filter(Boolean)
      .join(" · ");
    const row: AgentRow = {
      id: r.id,
      name: r.name,
      meta,
      state,
      pill,
      tone,
      now: nowLine(state, r, runs, sw, unknown),
      off: Boolean(sw?.paused),
      mode: sw?.paused ? "off" : sw?.mode === "shadow" ? "shadow" : "live",
      canPause: r.controls.pause,
      canShadow: r.controls.pause && r.controls.shadow,
      canRun: r.controls.runNow,
      runNote: runNote(r, sends, sw),
      runs: runs.map((run) => {
        const [word, runTone] = RUN_WORD[run.status];
        const text = run.status === "error" ? (run.error ?? run.summary) : (run.summary ?? run.error);
        return { id: run.id, word, tone: runTone, at: at(run.started_at), text: text ? clip(text.split("\n")[0], 160) : "" };
      }),
      sends: sends.map((s) => {
        const [word, sendTone] = SEND_WORD[s.status];
        // A shadow record reads as what it would have sent, under the live key
        // it would have claimed, so it lines up with a real send of the same effect.
        const what = s.status === "shadow" ? `${KIND[s.kind]} · ${s.summary ?? "no summary"} · ${s.key.replace(/^shadow:/, "")}` : `${KIND[s.kind]} · ${s.key}`;
        return { id: s.id, word, tone: sendTone, what, unknown: s.status === "unknown", hint: s.status === "unknown" ? UNKNOWN_HINT[s.kind] : null };
      }),
      needsLook: RANK[state] <= RANK.look || unknown > 0,
      busy: state === "running" || state === "waiting",
    };
    return { row, index };
  });
  return rows.sort((a, b) => RANK[a.row.state] - RANK[b.row.state] || a.index - b.index).map((x) => x.row);
}
