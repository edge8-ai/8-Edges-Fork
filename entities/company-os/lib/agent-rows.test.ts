import { describe, expect, it } from "vitest";
import type { EffectRow } from "@/kernel/audit/effects";
import type { RoutineSwitch } from "@/kernel/audit/routine-config";
import type { RecentRun } from "@/kernel/audit/routine-runs";
import type { Routine } from "./agent-management";
import { buildAgentRows, businessWeekStart } from "./agent-rows";

// Y.25: Settings -> Agents shows what a routine is doing now, not only how
// its last run ended, and puts what needs a person first.

function routine(id: string, extra: Partial<Routine> = {}): Routine {
  return {
    id,
    name: id,
    description: "",
    host: "vercel",
    hostLabel: "Vercel",
    schedule: "Mon, 00:00 UTC",
    cron: "0 0 * * 1",
    content: [],
    skill: "",
    apps: ["Supabase", "Lark"],
    controls: { pause: true, runNow: true, shadow: false },
    ...extra,
  };
}

let n = 0;
function run(routine_id: string, status: RecentRun["status"], extra: Partial<RecentRun> = {}): RecentRun {
  n += 1;
  return { id: `r${n}`, routine_id, status, started_at: "2026-10-08T23:00:12Z", finished_at: null, summary: null, error: null, step_deadline_at: null, ...extra };
}

function effect(routine_id: string, status: EffectRow["status"]): EffectRow {
  n += 1;
  return { id: `e${n}`, key: `ideas:nudge:p${n}:2026-W41`, kind: "lark", status, routine_id, claimed_at: "2026-10-06T00:00:00Z", summary: null };
}

function build(input: { routines: Routine[]; runs?: RecentRun[]; switches?: RoutineSwitch[]; effects?: EffectRow[] }) {
  const runs = new Map<string, RecentRun[]>();
  for (const r of input.runs ?? []) runs.set(r.routine_id, [...(runs.get(r.routine_id) ?? []), r]);
  return buildAgentRows({
    routines: input.routines,
    runs,
    switches: new Map((input.switches ?? []).map((s) => [s.routineId, s])),
    effects: input.effects ?? [],
    tokens: () => null,
  });
}

const by = (rows: ReturnType<typeof build>, id: string) => rows.find((r) => r.id === id)!;

describe("buildAgentRows", () => {
  it("reads each live state off the newest runs, the switch and the effects", () => {
    const rows = build({
      routines: ["running", "waiting", "twice", "once", "died", "look", "ok", "skipped", "never", "off"].map((id) => routine(id)),
      runs: [
        run("running", "running", { step_deadline_at: "2026-10-08T23:05:12Z" }),
        run("waiting", "waiting", { summary: "ready: approval opened" }),
        run("twice", "error", { error: "Assemble: 508 from the call to action page" }),
        run("twice", "error"),
        run("once", "error", { error: "Lark refused" }),
        run("once", "ok"),
        run("died", "died"),
        run("look", "ok", { summary: "nudged 9" }),
        run("ok", "ok", { summary: "pageviews 944" }),
        run("skipped", "skipped", { summary: "not its day" }),
        run("off", "ok"),
      ],
      switches: [{ routineId: "off", mode: "paused", paused: true, reason: "waiting on the redesign decision", updatedAt: "2026-10-07T03:00:00Z", updatedBy: "Ana" }],
      effects: [effect("look", "unknown"), effect("look", "done")],
    });
    expect(Object.fromEntries(rows.map((r) => [r.id, r.state]))).toEqual({
      running: "running",
      waiting: "waiting",
      twice: "error-twice",
      once: "error",
      died: "died",
      look: "look",
      ok: "ok",
      skipped: "skipped",
      never: "never",
      off: "off",
    });
    expect(by(rows, "running").now).toBe("Running since 06:00:12. Its step must finish by 06:05; the reaper marks it died a minute after.");
    expect(by(rows, "twice").now).toBe("Error twice in a row: Assemble: 508 from the call to action page.");
    expect(by(rows, "look").now).toBe("OK, but one send may or may not have gone out. It will not be sent again until you say.");
    expect(by(rows, "off").now).toBe(
      "Off since 7 Oct, by Ana: waiting on the redesign decision. Scheduled runs are recorded as skipped with this reason; Run now still works.",
    );
    expect(by(rows, "off").off).toBe(true);
  });

  it("puts what needs a person first, then what is in motion, in registry order within a state", () => {
    const rows = build({
      routines: ["ok-a", "running", "twice", "ok-b", "look"].map((id) => routine(id)),
      runs: [run("ok-a", "ok"), run("running", "running"), run("twice", "error"), run("twice", "error"), run("ok-b", "ok"), run("look", "ok")],
      effects: [effect("look", "unknown")],
    });
    expect(rows.map((r) => r.id)).toEqual(["twice", "look", "running", "ok-a", "ok-b"]);
    expect(rows.filter((r) => r.needsLook).map((r) => r.id)).toEqual(["twice", "look"]);
    expect(rows.filter((r) => r.busy).map((r) => r.id)).toEqual(["running"]);
  });

  it("keeps a send nobody can vouch for in Needs a look while the routine is off or running", () => {
    const rows = build({
      routines: [routine("off"), routine("running")],
      runs: [run("running", "running")],
      switches: [{ routineId: "off", mode: "paused", paused: true, reason: "redesign", updatedAt: "2026-10-07T03:00:00Z", updatedBy: null }],
      effects: [effect("off", "unknown"), effect("running", "unknown")],
    });
    expect(rows.every((r) => r.needsLook)).toBe(true);
  });

  it("lists the sends with the two answers' hint on an unknown one, and says what Run now will skip", () => {
    const rows = build({ routines: [routine("pulse")], effects: [effect("pulse", "done"), effect("pulse", "unknown")] });
    const row = by(rows, "pulse");
    expect(row.sends.map((s) => [s.word, s.unknown])).toEqual([
      ["Sent", false],
      ["Unknown", true],
    ]);
    expect(row.sends[1].hint).toMatch(/before Lark answered/);
    expect(row.runNote).toContain("Sends already done this week are skipped by their keys (1 so far)");
    expect(row.runNote).toContain("The unknown send stays unsent until you settle it below.");
    expect(row.runNote).toContain("It talks to Lark.");
  });

  it("offers the switch and Run now only where the routine honours them", () => {
    const rows = build({
      routines: [routine("mac", { host: "mac-mini", controls: { pause: false, runNow: false, shadow: false } }), routine("writer", { cron: undefined, controls: { pause: true, runNow: false, shadow: false } })],
    });
    expect([by(rows, "mac").canPause, by(rows, "mac").canRun]).toEqual([false, false]);
    expect([by(rows, "writer").canPause, by(rows, "writer").canRun]).toEqual([true, false]);
    expect(by(rows, "mac").meta).toBe("Mon, 00:00 UTC · Mac mini");
    expect(by(rows, "writer").now).toBe("Never run. It runs when something starts it.");
  });

  it("shows a routine in shadow, the three-way switch, and what its shadow runs would have sent (Z.17)", () => {
    const shadowSwitch = (routineId: string): RoutineSwitch => ({ routineId, mode: "shadow", paused: false, reason: null, updatedAt: "2026-10-07T03:00:00Z", updatedBy: "Ana" });
    const record: EffectRow = {
      id: "s1",
      key: "crm:followup-ready:m1",
      kind: "lark",
      status: "shadow",
      routine_id: "chain",
      claimed_at: "2026-10-08T00:00:00Z",
      summary: "Lark DM to the revenue approver: follow-up for Acme ready",
    };
    record.key = `shadow:${record.key}`;
    const rows = build({
      routines: [routine("chain", { controls: { pause: true, runNow: true, shadow: true } }), routine("plain"), routine("odd")],
      runs: [run("chain", "ok", { summary: "shadow: drafted 1" })],
      switches: [shadowSwitch("chain"), shadowSwitch("odd")],
      effects: [record],
    });
    const chain = by(rows, "chain");
    expect([chain.state, chain.pill, chain.mode, chain.canShadow, chain.off]).toEqual(["shadow", "Shadow", "shadow", true, false]);
    expect(chain.now).toBe("In shadow since 7 Oct, by Ana: it runs and records what it would have sent, and sends nothing. Last run: shadow: drafted 1.");
    expect(chain.sends).toEqual([
      { id: "s1", word: "Would send", tone: "muted", what: "Lark · Lark DM to the revenue approver: follow-up for Acme ready · crm:followup-ready:m1", unknown: false, hint: null },
    ]);
    expect(chain.needsLook).toBe(false);
    expect(chain.runNote).toContain("It is in shadow: this run records what it would send and sends nothing.");
    expect([by(rows, "plain").mode, by(rows, "plain").canShadow]).toEqual(["live", false]);
    // Set to shadow by hand on a routine that cannot honour it: the kernel skips its runs, and the row says so.
    expect(by(rows, "odd").now).toBe("Set to shadow since 7 Oct, by Ana, which it does not support, so its scheduled runs are skipped. Turn it on or off.");
    // Run now is skipped too, and its confirmation says so; the switch does not read On.
    expect(by(rows, "odd").runNote).toContain("It is set to shadow, which it does not support, so this run will be skipped.");
    expect([by(rows, "odd").mode, by(rows, "odd").off]).toEqual(["shadow", false]);
  });

  it("lists the last runs with the error of a failed one", () => {
    const rows = build({ routines: [routine("x")], runs: [run("x", "error", { summary: "first line", error: "Lark refused\nstack" }), run("x", "ok", { summary: "posted 3" })] });
    expect(by(rows, "x").runs.map((r) => [r.word, r.at, r.text])).toEqual([
      ["Error", "9 Oct, 06:00", "Lark refused"],
      ["OK", "9 Oct, 06:00", "posted 3"],
    ]);
  });
});

describe("businessWeekStart", () => {
  it("is a Monday at midnight in Ho Chi Minh City", () => {
    const start = businessWeekStart();
    expect(start.getUTCDay()).toBe(0); // Sunday 17:00 UTC
    expect(start.getUTCHours()).toBe(17);
  });
});
