import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { one, type Embedded } from "@/kernel/config/embedded";
import { addDays, nextWorkday, saigonToday } from "@/kernel/config/dates";
import { publish } from "@/kernel/events";
import { OPEN_STATUS } from "@/entities/boards/lib/card-stage";
import { isWaitingLane } from "@/entities/boards/lib/board-state";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs. Read as text by the generator.
 * @generator
 */
export const schedule = "0 1 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Due tomorrow",
  description: "Weekdays at 08:00. Tells each assignee, in their Inbox, about an open card due on the next working day (on a Friday, the weekend and Monday too). Once per card per due date; nothing is sent to chat or email.",
  content: ["Board cards"],
  apps: ["Supabase"],
};

// Vercel cron: weekdays 01:00 UTC (08:00 Asia/Ho_Chi_Minh). TH.2: the Inbox
// says what is due before it is late. Boards owns the cards, so it reads them
// and states one fact per card; the inbox decides who hears it and dedupes on
// the card and its due date, so a rerun on the same morning tells nobody twice.

const ROUTINE_ID = "/api/cron/due-tomorrow/";
/** A morning's ceiling, so one run cannot outgrow the function. */
const MAX_CARDS = 1000;

type DueRow = {
  id: string;
  title: string;
  assignee_id: string;
  due_date: string;
  parent_task_id: string | null;
  board: { slug: string | null } | { slug: string | null }[] | null;
  column: Embedded<{ name: string | null }>;
  parent: Embedded<{ column: Embedded<{ name: string | null }> }>;
};

/**
 * Whether a card is parked in Waiting, which this reminder, the digest and the
 * weekly summary leave out (U.4). A
 * subtask is read by its parent's lane: its own column is often empty or stale,
 * and it is the card on the board that was parked.
 */
export function parkedInWaiting(r: Pick<DueRow, "parent_task_id" | "column" | "parent">): boolean {
  const lane = r.parent_task_id ? one(one(r.parent)?.column)?.name : one(r.column)?.name;
  return lane ? isWaitingLane(lane) : false;
}

/** The days after `today` up to and including the next working day: Friday covers the weekend and Monday. */
export function dueWindow(today: string): { after: string; through: string } {
  return { after: today, through: nextWorkday(addDays(today, 1)) };
}

async function handler(): Promise<Response> {
  const { after, through } = dueWindow(saigonToday());
  // A failed read stops the run as an error rather than telling nobody quietly.
  const rows = mustRows(
    await companyOs
      .from("tasks")
      .select(
        "id, title, assignee_id, due_date, parent_task_id, board:boards!board_id(slug), column:board_columns!board_column_id(name), parent:tasks!parent_task_id(column:board_columns!board_column_id(name))",
      )
      .eq("status", OPEN_STATUS)
      .is("archived_at", null)
      .not("assignee_id", "is", null)
      .gt("due_date", after)
      .lte("due_date", through)
      .limit(MAX_CARDS),
    "[boards/due-tomorrow] cards due",
  ) as unknown as DueRow[];
  let told = 0;
  for (const r of rows) {
    const slug = one(r.board)?.slug;
    if (!slug || parkedInWaiting(r)) continue;
    await publish("board.card.due_tomorrow", { taskId: r.id, boardSlug: slug, dueOn: r.due_date, title: r.title, assigneeId: r.assignee_id });
    told += 1;
  }
  return routineResult({
    status: told === 0 ? "skipped" : "ok",
    reason: told === 0 ? "no open card is due before the next working day ends" : undefined,
    window: `${after} < due <= ${through}`,
    told,
  });
}

// Every run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request): Promise<Response> => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
