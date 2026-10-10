import automations from "@/kernel/audit/automations.json";

// Agent Management (Settings → Agents): one pane over every managed routine we
// run, unified across hosts. A "managed agent" here is a scheduled worker with
// four things worth seeing at a glance: the CONTENT it reads, the SKILL (or
// route) it follows, the ROUTINE (schedule) it runs on, and the APPS it talks
// to.
//
// Two hosts feed this page, and both are things Edge8 itself runs:
//   - Vercel: every cron route, scheduled or on demand, from the automation
//     registry (kernel/audit/automations.json, Y.14). scripts/gen-deployment.mjs
//     writes it from the `automation` block each cron declares beside its
//     `schedule`, so a routine's description lives with its code, and a cron
//     without one fails check:generated instead of rendering "No metadata yet"
//     here (eleven had drifted, Y.44).
//   - Mac mini: the launchd jobs installed on the office Mac mini, listed in
//     MAC_MINI_ROUTINES next to the script each one runs.
// Whether a routine actually ran, and what it did, comes from
// company_os.routine_runs (kernel/audit/routine-runs.ts), which every routine
// on both hosts writes. The page joins the two: definition here, evidence there.
// Personal Claude Desktop tasks on laptops are deliberately not listed: the
// page cannot observe them, and policy is that routines do not live on laptops.

export type RoutineHost = "vercel" | "mac-mini";

export type Routine = {
  id: string;
  name: string;
  description: string;
  host: RoutineHost;
  // Where the routine physically runs, in words (e.g. the exact machine a local
  // routine was captured on). Vercel routines just say "Vercel".
  hostLabel: string;
  // Human schedule ("Weekdays 07:00 UTC"). For Vercel routines this is derived
  // live from the cron expression in vercel.json.
  schedule: string;
  // Raw cron expression when there is one (Vercel crons; some local routines).
  cron?: string;
  // The data / subjects it reads.
  content: string[];
  // The skill it follows (local) or the route handler that is its logic (Vercel).
  skill: string;
  // Connected apps / services.
  apps: string[];
  // What Settings -> Agents may do to it (Y.25). `pause`: its runs honour the
  // routine_config switch (every cron mount through withRoutineRun, and the
  // writer and letter agents through the agent driver). `runNow`: it has a
  // schedule, so a bare run of its handler is the schedule's run, by hand.
  // Mac mini jobs and background work honour neither. `shadow` (Z.17): the
  // routine declares it honours shadow mode, so the switch offers Live,
  // Shadow and Off rather than On and Off.
  controls: { pause: boolean; runNow: boolean; shadow: boolean };
};

// Neither the switch nor Run now: nothing on that path reads routine_config,
// and its runs are started by something other than a schedule this app owns.
const NO_CONTROLS = { pause: false, runNow: false, shadow: false } as const;
// The agent driver leaves a paused agent's runs waiting (step-driver.ts), but
// a step needs its campaign, so Run now stays with the agent's own screen.
// Neither agent declares shadow yet; one that does passes `shadow: true` to
// the driver as well (DrivenAgent), because the kernel cannot read this list.
const AGENT_CONTROLS = { pause: true, runNow: false, shadow: false } as const;

// ── Mac mini routines ─────────────────────────────────────────────────────
// launchd jobs on the office Mac mini. Each records its run through
// scripts/routine-run-record.mjs, so the Agents page shows it beside the crons.
export const MAC_MINI_ROUTINES: Routine[] = [
  {
    id: "mac-mini:htt-nightly-sync",
    name: "HTT: nightly local sync",
    description:
      "Nightly. Syncs pull requests for every tracked repo, ingests recorder telemetry from the tracker branch, and backfills the Mac mini's own Claude sessions into the Human Token Tracker. Bridges the hosted pipeline until its secrets exist.",
    host: "mac-mini",
    hostLabel: "Office Mac mini (launchd ai.edge8.htt-nightly-sync)",
    schedule: "Daily, 03:30 Asia/Ho_Chi_Minh",
    cron: "30 3 * * *",
    content: ["GitHub PRs (tracked repos)", "Recorder telemetry", "Local Claude transcripts"],
    skill: "scripts/htt/nightly-local-sync.sh",
    apps: ["GitHub", "Supabase"],
    controls: NO_CONTROLS,
  },
];

// ── On-demand Vercel routines ─────────────────────────────────────────────
// Routine ids that are recorded as routine runs but are not scheduled in
// vercel.json themselves: each step of an agent run is recorded under its
// agent's id, whether a person's button or the agent driver ran it, so they are
// listed here to keep their runs visible beside the crons.
export const ON_DEMAND_ROUTINES: Routine[] = [
  {
    id: "/api/cron/writer-agent/",
    name: "Writer agent",
    description:
      "One step of a campaign's writer run (draft, edit, SEO, exhibits, hero, links, assemble, validate) per row. Started from the campaign hub's Run the writer button or the daily schedule, which run the first step at once; the agent driver runs the rest, one step every five minutes.",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "Each step on the agent driver; started from the campaign hub or the daily writer schedule",
    content: ["Marketing campaigns", "Blog assets", "Brand profiles"],
    skill: "entities/campaigns/lib/writer/run-step.ts",
    apps: ["Supabase", "Anthropic", "Gemini", "Lark"],
    controls: AGENT_CONTROLS,
  },
  {
    id: "/api/cron/letter-agent/",
    name: "Letter agent",
    description:
      "One step of a broadcast's letter agent run (gather the week, pick three unsent posts, write, rotate the call to action and layout, assemble, validate and send the test) per row. Started by the Monday and Thursday cron or the broadcast page's Run the letter agent button; the agent driver runs the rest, one step every five minutes. Parks at ready and never sends to the list.",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "Each step on the agent driver; started from the broadcast page or the Monday and Thursday letter cron",
    content: ["Email campaigns", "Events", "Meetings", "Journal (Notion)", "Blog assets", "Brand profiles"],
    skill: "entities/campaigns/lib/letter/run-step.ts",
    apps: ["Supabase", "Notion", "Anthropic", "Resend", "Lark"],
    controls: AGENT_CONTROLS,
  },
  {
    // Z.13: the switch on this row is the chain's. It honours shadow, and the
    // migration that made its table set it to Shadow, so the chain starts there.
    id: "/api/cron/meeting-actions/",
    name: "Meeting follow-up",
    description:
      "One step of a client meeting's follow-up run (gather, extract the agreed actions, draft the follow-up, ask for approval, send) per row. Opened by the CRM driver when a client meeting's summary is ready, or from the meeting page's Start actions and follow-up; the CRM driver runs the rest, one step every five minutes. Parks at ready and sends only the version its approver approved; in shadow it proposes and drafts and sends nothing.",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "Each step on the CRM driver; started by the driver or from the meeting page",
    content: ["Meetings", "Meeting follow-ups", "Meeting action items", "Approvals"],
    skill: "entities/crm/lib/meeting-actions/run.ts",
    apps: ["Supabase", "Anthropic", "Resend", "Lark"],
    controls: { pause: true, runNow: false, shadow: true },
  },
  {
    id: "/background/meeting-summary/",
    name: "Meeting summary",
    description: "After a meeting is saved or re-summarised from the CRM, the AI summary is written in the background as a run of its own, retried once (Y.24).",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "In the background, after the request that starts it",
    content: ["Meetings"],
    skill: "entities/assistant/lib/meeting-summary.ts",
    apps: ["Supabase", "Anthropic"],
    controls: NO_CONTROLS,
  },
  {
    id: "/background/resume-screen/",
    name: "Résumé screen",
    description: "After an application arrives (careers page or the admin form), the AI résumé screen runs in the background as a run of its own, retried once (Y.24).",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "In the background, after the request that starts it",
    content: ["Applications", "Résumés"],
    skill: "entities/hiring/lib/resume-screen.ts",
    apps: ["Supabase", "Anthropic"],
    controls: NO_CONTROLS,
  },
  {
    id: "/background/interview-score/",
    name: "Interview scoring",
    description: "After an interview round is saved, the AI panelist scores it in the background as a run of its own, retried once (Y.24).",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "In the background, after the request that starts it",
    content: ["Interview rounds"],
    skill: "entities/hiring/lib/interview-panelist.ts",
    apps: ["Supabase", "Anthropic"],
    controls: NO_CONTROLS,
  },
  {
    id: "/background/review-summary/",
    name: "Review-call summary",
    description: "After a review call is written up, its AI summary is written in the background as a run of its own, retried once (Y.24).",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "In the background, after the request that starts it",
    content: ["Performance reviews"],
    skill: "entities/team/lib/review-summary.ts",
    apps: ["Supabase", "Anthropic"],
    controls: NO_CONTROLS,
  },
];

// ── Cron → human schedule ─────────────────────────────────────────────────
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Best-effort, readable rendering of the cron shapes we actually use. Falls
// back to the raw expression rather than guessing on anything exotic.
export function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const everyN = min.match(/^\*\/(\d+)$/);
  if (everyN && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${everyN[1]} minutes`;
  }
  if (min === "*" && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return "Every minute";
  }

  const mm = /^\d+$/.test(min) ? min.padStart(2, "0") : null;
  const hh = /^\d+$/.test(hour) ? hour.padStart(2, "0") : null;
  const time = mm && hh ? `${hh}:${mm} UTC` : null;

  // Hourly at a given minute.
  if (hh === null && mm && dom === "*" && mon === "*" && dow === "*") {
    return `Hourly at :${mm} UTC`;
  }

  let when = "";
  if (dow !== "*" && /^\d+$/.test(dow)) when = `${DOW[Number(dow) % 7]}`;
  else if (dom !== "*" && /^\d+$/.test(dom)) when = `Day ${dom} of the month`;
  else when = "Daily";

  return time ? `${when}, ${time}` : `${when} (${expr})`;
}

// ── Loader ────────────────────────────────────────────────────────────────
export type AgentManagementView = {
  routines: Routine[];
  vercel: Routine[];
  macMini: Routine[];
};

type Automation = {
  path: string;
  file: string;
  schedule: string | null;
  name: string;
  description: string;
  content: string[];
  apps: string[];
  shadow?: boolean;
};

export function loadAgentManagement(): AgentManagementView {
  const vercel: Routine[] = (automations as Automation[]).map((a) => ({
    id: a.path,
    name: a.name,
    description: a.description,
    host: "vercel",
    hostLabel: "Vercel",
    schedule: a.schedule ? cronToHuman(a.schedule) : "On demand, never scheduled",
    ...(a.schedule ? { cron: a.schedule } : {}),
    content: a.content,
    skill: a.file,
    apps: a.apps,
    // Every cron mount runs through withRoutineRun, which honours the pause;
    // only a scheduled one is a run Run now can repeat without a subject.
    controls: { pause: true, runNow: a.schedule !== null, shadow: a.shadow === true },
  }));

  const macMini = MAC_MINI_ROUTINES;
  return { routines: [...vercel, ...ON_DEMAND_ROUTINES, ...macMini], vercel: [...vercel, ...ON_DEMAND_ROUTINES], macMini };
}

export function findRoutine(id: string): Routine | null {
  return loadAgentManagement().routines.find((r) => r.id === id) ?? null;
}
