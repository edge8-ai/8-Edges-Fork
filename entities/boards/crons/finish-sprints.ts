import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { companyOs } from "@/kernel/data/supabase";
import { addDays, saigonToday } from "@/kernel/config/dates";
import { closeSprintAsSystem } from "@/entities/boards/lib/sprint-close";
import { sprintWeek, weeklySprintChat } from "@/entities/boards/lib/sprint-cadence";
import { BOARD_SELECT, SPRINT_SELECT, type BoardRow, type SprintRow } from "@/entities/boards/lib/types";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 17 * * 2";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Finish sprints",
  description: "Wednesdays at midnight. On every board with weekly sprints switched on, closes each sprint that ended before the week's sprint and carries its unfinished cards and subtasks into the sprint that is starting. Done cards stay where they finished. A board with no sprint for the week is left alone and named.",
  content: ["Boards", "Sprints", "Board cards"],
  apps: ["Supabase"],
};

// Vercel cron (see vercel.json): Tuesday 17:00 UTC is Wednesday 00:00 in Saigon,
// the moment a sprint starts (W.207.1). It only writes rows and tells nobody, so
// the 09:00 to 18:00 working window (CLAUDE.md, "Working hours") does not bind it.
// The routine reads the business date in Saigon, not the server's, so it sees Wednesday.
//
// Planning finishes itself: on each board with weekly sprints it finds the
// sprint of the week that starts today (by its week key), takes every active
// sprint that started earlier on that board as ended, and closes each one the
// way Finish planning does, with the starting sprint as the rollover target,
// under the system's name. Done cards are not touched. A board with no sprint
// for the week is skipped, because carrying cards into a sprint that does not
// exist would strand them. The rows are the idempotency: a second run finds no
// active sprint that started earlier, so it changes nothing, and a missed night
// heals on the next run for the same reason.
const LABEL = "finish-sprints";
const WEDNESDAY = 3;

type Skipped = { board: string; reason: string };
type Failure = { subject: string; step: string; error: string };
type ClosedSprint = { board: string; sprint: string; carried: number };

// The Wednesday on or before a Saigon date: the first day of the sprint that is running or starting.
function sprintStartOnOrBefore(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday - WEDNESDAY + 7) % 7));
}

async function handler(_req: Request) {
  const today = saigonToday();
  const week = sprintWeek(sprintStartOnOrBefore(today));

  const boardsRes = await companyOs.from("boards").select(BOARD_SELECT).eq("status", "active").is("archived_at", null).order("sort_order");
  if (boardsRes.error) return NextResponse.json({ error: boardsRes.error.message }, { status: 500 });
  const boards = (boardsRes.data ?? []) as BoardRow[];
  const weekly = boards.filter((b) => weeklySprintChat(b));
  const skipped: Skipped[] = boards.filter((b) => !weeklySprintChat(b)).map((b) => ({ board: b.name, reason: "weekly sprints are not switched on" }));
  if (weekly.length === 0) return routineResult({ status: "skipped", reason: "no board has weekly sprints switched on", today, week, skipped });

  const sprintsRes = await companyOs
    .from("sprints")
    .select(SPRINT_SELECT)
    .in("board_id", weekly.map((b) => b.id))
    .eq("status", "active");
  if (sprintsRes.error) return NextResponse.json({ error: sprintsRes.error.message }, { status: 500 });
  const sprints = (sprintsRes.data ?? []) as SprintRow[];

  const closed: ClosedSprint[] = [];
  const failures: Failure[] = [];
  let carried = 0;
  for (const board of weekly) {
    const own = sprints.filter((s) => s.board_id === board.id && s.status === "active");
    const starting = own.find((s) => s.week === week);
    if (!starting || !starting.starts_on) {
      skipped.push({ board: board.name, reason: `no sprint for ${week}` });
      continue;
    }
    const startsOn = starting.starts_on;
    const ended = own.filter((s) => s.id !== starting.id && s.starts_on !== null && s.starts_on < startsOn);
    for (const sprint of ended) {
      const outcome = await closeSprintAsSystem({
        sprintId: sprint.id,
        boardId: board.id,
        boardSlug: board.slug,
        rolloverToSprintId: starting.id,
        label: LABEL,
      });
      if (!outcome.ok) {
        failures.push({ subject: `${board.name} / ${sprint.name}`, step: "close sprint", error: outcome.error });
        continue;
      }
      carried += outcome.carried;
      closed.push({ board: board.name, sprint: sprint.name, carried: outcome.carried });
    }
  }

  // A sprint that would not close names its board and sprint, so the run shows red on Settings -> Agents (Y.20).
  return routineResult({
    status: "ok",
    today,
    week,
    sprintsClosed: closed.length,
    carried,
    closed,
    skipped,
    failures,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/finish-sprints/", req, handler, "vercel", { stepSeconds: 60 });
