import { companyOs } from "@/kernel/data/supabase";
import { readBoards, readTasks } from "./workboard-reads";
import { BOARD_COLUMN_SELECT, daysInColumn, isSnoozed, type BoardColumnRow, type BoardRow, type TaskRow } from "./types";
import { laneStatus } from "./workboard-lanes";
import { isOverdue as overdueOn } from "./card-facts";
import { businessDate } from "@/kernel/config/dates";
import { mustRows, readOr } from "@/kernel/data/read";

// The Workboard's Flow view (RH-6): what is stuck, what is blocked, what is
// overdue, and how cards have been arriving and completing by week. Every
// figure is about cards, columns and boards. The aggregate takes rows and a
// clock and returns numbers; it never reads assignee_id or moved_by, and the
// row types it accepts do not carry them.

export type FlowTask = Pick<TaskRow, "id" | "board_id" | "board_column_id" | "status" | "priority" | "due_date" | "created_at" | "completed_at" | "parent_task_id" | "metadata">;
export type FlowColumn = Pick<BoardColumnRow, "id" | "board_id" | "name" | "position" | "is_done"> & { is_not_doing?: boolean };
export type FlowBoard = Pick<BoardRow, "id" | "name" | "slug" | "client_company_id">;
export type FlowLogRow = { task_id: string; to_column_id: string | null; moved_at: string };

export const FLOW_BUCKETS = ["0–7 d", "8–30 d", "31–90 d", "90+ d"] as const;
type Bucket = (typeof FLOW_BUCKETS)[number];
const bucket = (days: number): Bucket => (days <= 7 ? "0–7 d" : days <= 30 ? "8–30 d" : days <= 90 ? "31–90 d" : "90+ d");

export type BucketRow = { label: string; value: number };
export type WeekPoint = { week: string; label: string; created: number; completed: number };
export type ColumnFlow = { name: string; isDone: boolean; open: number; oldestDays: number };
export type BoardFlow = { id: string; name: string; slug: string; client: boolean; open: number; done: number; blocked: number; overdue: number; oldestDays: number; columns: ColumnFlow[] };

export type FlowMetrics = {
  boards: number;
  open: number;
  done: number;
  blocked: number;
  overdue: number;
  noDueDate: number;
  agingInColumn: BucketRow[];
  byPriority: BucketRow[];
  weekly: WeekPoint[];
  perBoard: BoardFlow[];
};

const isBlockerChild = (t: FlowTask) => !!t.parent_task_id && (t.metadata as { kind?: string } | null)?.kind === "blocker" && t.status === "open";

export function aggregateFlow(boards: FlowBoard[], columns: FlowColumn[], tasks: FlowTask[], log: FlowLogRow[], now: Date): FlowMetrics {
  // A card's status as its LANE shows it (W.111): a card sitting in a done
  // column is done, whatever the row says, exactly as the board reads it. The
  // Blocked and Overdue tiles link to the board's filter (W.121), so a card
  // the board calls done must not be counted here as open.
  const columnById = new Map(columns.map((c) => [c.id, c]));
  const cards = tasks
    .filter((t) => !t.parent_task_id)
    .map((t) => ({ ...t, status: laneStatus(t.status, columnById.get(t.board_column_id ?? "")) }));
  const open = cards.filter((t) => t.status === "open");
  const blockedIds = new Set(tasks.filter(isBlockerChild).map((t) => t.parent_task_id as string));
  const latest = new Map<string, FlowLogRow>();
  for (const row of log) {
    const cur = latest.get(row.task_id);
    if (!cur || row.moved_at > cur.moved_at) latest.set(row.task_id, row);
  }
  const inColumnDays = (t: FlowTask) => {
    const l = latest.get(t.id);
    return daysInColumn(l && l.to_column_id === t.board_column_id ? l.moved_at : t.created_at, now);
  };
  // The board's own rule (card-facts.ts, W.121). It was `new Date(due_date) <
  // now`, which is UTC midnight, so a card due today counted as overdue here
  // from 07:00 in Saigon while the board still showed it on time — and the
  // Overdue tile now links to the board's Overdue filter.
  const today = businessDate(now);
  const isOverdue = (t: FlowTask) => overdueOn(t, today);
  // Blocked and overdue are counted over the cards the board SHOWS: a snoozed
  // card is parked off the board until its date (W.54), so the tile would
  // otherwise read higher than the filtered board it opens, with nothing on
  // screen to say why.
  const awake = (t: FlowTask) => !isSnoozed(t as { metadata: Record<string, unknown> }, today);

  const aging: Record<Bucket, number> = { "0–7 d": 0, "8–30 d": 0, "31–90 d": 0, "90+ d": 0 };
  for (const t of open) aging[bucket(inColumnDays(t))]++;

  const priority = new Map<string, number>();
  for (const t of open) priority.set(t.priority || "none", (priority.get(t.priority || "none") ?? 0) + 1);

  const weekly: WeekPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(now.getUTCDate() - now.getUTCDay() - 7 * i);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    const inWeek = (d: string | null) => !!d && new Date(d) >= start && new Date(d) < end;
    weekly.push({
      week: start.toISOString().slice(0, 10),
      label: start.toISOString().slice(5, 10),
      created: cards.filter((t) => inWeek(t.created_at)).length,
      completed: cards.filter((t) => inWeek(t.completed_at)).length,
    });
  }

  const perBoard: BoardFlow[] = boards
    .map((b) => {
      const oc = open.filter((t) => t.board_id === b.id);
      const cols = columns.filter((c) => c.board_id === b.id).sort((a, c) => a.position - c.position);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        client: !!b.client_company_id,
        open: oc.length,
        done: cards.filter((t) => t.board_id === b.id && t.status === "done").length,
        blocked: oc.filter((t) => awake(t) && blockedIds.has(t.id)).length,
        overdue: oc.filter((t) => awake(t) && isOverdue(t)).length,
        oldestDays: Math.max(0, ...oc.map(inColumnDays)),
        columns: cols.map((c) => {
          const cc = oc.filter((t) => t.board_column_id === c.id);
          return { name: c.name, isDone: c.is_done, open: cc.length, oldestDays: Math.max(0, ...cc.map(inColumnDays)) };
        }),
      };
    })
    .filter((b) => b.open + b.done > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  return {
    boards: perBoard.length,
    open: open.length,
    // Counted, not derived as "everything not open": a card set aside in Not
    // Doing is neither, and the per-board rows below already count it that way.
    done: cards.filter((t) => t.status === "done").length,
    blocked: open.filter((t) => awake(t) && blockedIds.has(t.id)).length,
    overdue: open.filter((t) => awake(t) && isOverdue(t)).length,
    noDueDate: open.filter((t) => !t.due_date).length,
    agingInColumn: FLOW_BUCKETS.map((label) => ({ label, value: aging[label] })),
    byPriority: [...priority.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label)),
    weekly,
    perBoard,
  };
}

export async function loadFlow(now = new Date()): Promise<FlowMetrics> {
  const boards = await readBoards({ kind: "all" });
  const ids = boards.map((b) => b.id);
  const [tasks, colsRes, logRes] = await Promise.all([
    readTasks(ids),
    companyOs.from("board_columns").select(BOARD_COLUMN_SELECT).in("board_id", ids).order("position"),
    companyOs.from("task_stage_log").select("task_id, to_column_id, moved_at").order("moved_at", { ascending: false }).limit(20000),
  ]);
  // The columns decide which cards are done (laneStatus, A.29.1): a failed
  // read would count every card in a done column as open, which is a wrong
  // answer, so it fails the page. The stage log only ages cards, and without
  // it a card ages from its creation, which is a fair fallback.
  const columns = mustRows(colsRes, "boards: flow board_columns") as FlowColumn[];
  const log = readOr(logRes, "boards: flow task_stage_log", []) as FlowLogRow[];
  return aggregateFlow(boards, columns, tasks, log, now);
}
