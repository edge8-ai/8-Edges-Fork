import { companyOs } from "@/kernel/data/supabase";
import { readBoards, readTasks } from "./workboard-reads";
import { BOARD_COLUMN_SELECT, daysInColumn, isSnoozed, type BoardColumnRow, type BoardRow, type TaskRow } from "./types";
import { isOpen, isDone, laneStage } from "./card-stage";
import { isWaitingLane } from "./board-state";
import { isOverdue as overdueOn } from "./card-facts";
import { businessDate, diffDays } from "@/kernel/config/dates";
import { mustRows, readOr } from "@/kernel/data/read";

// The Workboard's Flow view (RH-6): what is stuck, what is blocked, what is
// overdue, and how cards have been arriving and completing by week. Every
// figure is about cards, columns and boards. The aggregate takes rows and a
// clock and returns numbers, and the stuck cards by title and board (AH.7); it
// never reads assignee_id or moved_by, and the row types it accepts do not
// carry them.

export type FlowTask = Pick<TaskRow, "id" | "title" | "board_id" | "board_column_id" | "status" | "priority" | "due_date" | "created_at" | "completed_at" | "parent_task_id" | "metadata" | "human_tokens"> & { internal?: boolean };
export type FlowColumn = Pick<BoardColumnRow, "id" | "board_id" | "name" | "position" | "is_done"> & { is_not_doing?: boolean };
export type FlowBoard = Pick<BoardRow, "id" | "name" | "slug" | "client_company_id">;
export type FlowLogRow = { task_id: string; to_column_id: string | null; moved_at: string };

export const FLOW_BUCKETS = ["0–7 d", "8–30 d", "31–90 d", "90+ d"] as const;
type Bucket = (typeof FLOW_BUCKETS)[number];
const bucket = (days: number): Bucket => (days <= 7 ? "0–7 d" : days <= 30 ? "8–30 d" : days <= 90 ? "31–90 d" : "90+ d");

export type BucketRow = { label: string; value: number };
export type WeekPoint = { week: string; label: string; created: number; completed: number };
export type ColumnFlow = { name: string; isDone: boolean; open: number; oldestDays: number };
/** Cards finished in the last four weeks and the four before, by count and by Human Tokens (effort, never time). */
export type Finished = { cards: number; priorCards: number; tokens: number; priorTokens: number };
export const FINISHED_WINDOW_DAYS = 28;
export type BoardFlow = {
  id: string;
  name: string;
  slug: string;
  client: boolean;
  clientCompanyId: string | null;
  open: number;
  done: number;
  blocked: number;
  overdue: number;
  oldestDays: number;
  columns: ColumnFlow[];
  /** Cards finished in the last four weeks and the four before (the Company Dashboard's Work section). */
  finished: Finished;
  /** Cards the client can see (not internal), more than CLIENT_LATE_DAYS past their date, latest first (AH.7.2). */
  clientLate: { id: string; title: string; lateDays: number }[];
  /** Blockers open longer than OLD_BLOCKER_DAYS, oldest first, named by the card they hold up (AH.7.2). */
  oldBlockers: { cardTitle: string; days: number }[];
  /** Days since any card on the board was created, moved or finished; null for a board with no cards. */
  lastMoveDays: number | null;
};

// What Client Hubs counts as a real problem on a board (AH.7.2): a late date
// on an internal card is housekeeping, and a blocker is normal until it has
// sat for two weeks.
export const CLIENT_LATE_DAYS = 7;
export const OLD_BLOCKER_DAYS = 14;

/**
 * A card that needs someone to look at it (AH.7): blocked, past its date, or
 * sat in one column over a month. Work Analytics lists them, worst first, so
 * a count at the top is never the only thing the reader gets.
 */
export type StuckCard = {
  id: string;
  title: string;
  boardName: string;
  boardSlug: string;
  column: string;
  due: string | null;
  blocked: boolean;
  lateDays: number;
  daysInColumn: number;
};
export const STUCK_IN_COLUMN_DAYS = 30;

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
  /** Blocked first, then longest in one column, then latest. */
  stuck: StuckCard[];
};

const isBlockerChild = (t: FlowTask) => !!t.parent_task_id && (t.metadata as { kind?: string } | null)?.kind === "blocker" && isOpen(t);

export function aggregateFlow(boards: FlowBoard[], columns: FlowColumn[], tasks: FlowTask[], log: FlowLogRow[], now: Date): FlowMetrics {
  // A card's status as its LANE shows it (W.111): a card sitting in a done
  // column is done, whatever the row says, exactly as the board reads it. The
  // Blocked and Overdue tiles link to the board's filter (W.121), so a card
  // the board calls done must not be counted here as open.
  const columnById = new Map(columns.map((c) => [c.id, c]));
  const cards = tasks
    .filter((t) => !t.parent_task_id)
    // A card in a Waiting lane is parked on someone else, so the Overdue tile
    // skips it, as the board's filter does (W.207.4).
    .map((t) => {
      const column = columnById.get(t.board_column_id ?? "");
      return { ...t, status: laneStage(t.status, column), waiting: column ? isWaitingLane(column.name) : false };
    });
  const open = cards.filter((t) => isOpen(t));
  const blockers = tasks.filter(isBlockerChild);
  const blockedIds = new Set(blockers.map((t) => t.parent_task_id as string));
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
  const isOverdue = (t: FlowTask & { waiting?: boolean }) => overdueOn(t, today);
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

  // Finished work by board over two equal windows, so a client's last four
  // weeks read against its four before (the Company Dashboard's Work section).
  const windowStart = (n: number) => new Date(now.getTime() - n * FINISHED_WINDOW_DAYS * 86_400_000);
  const recentFrom = windowStart(1);
  const priorFrom = windowStart(2);
  const finishedOn = (boardId: string): Finished => {
    const f: Finished = { cards: 0, priorCards: 0, tokens: 0, priorTokens: 0 };
    for (const t of cards) {
      // Done by its lane, as the board shows it: a reopened card may keep a stale completed_at.
      if (t.board_id !== boardId || !t.completed_at || !isDone(t)) continue;
      const at = new Date(t.completed_at);
      if (at > now) continue;
      if (at >= recentFrom) {
        f.cards++;
        f.tokens += Number(t.human_tokens ?? 0);
      } else if (at >= priorFrom) {
        f.priorCards++;
        f.priorTokens += Number(t.human_tokens ?? 0);
      }
    }
    return f;
  };
  const lateDaysOf = (t: FlowTask & { waiting?: boolean }) => (isOverdue(t) && t.due_date ? Math.max(1, diffDays(t.due_date.slice(0, 10), today)) : 0);
  const lastTouch = (t: FlowTask) => [latest.get(t.id)?.moved_at, t.created_at, t.completed_at].reduce<string>((m, d) => (d && d > m ? d : m), "");

  const perBoard: BoardFlow[] = boards
    .map((b) => {
      const oc = open.filter((t) => t.board_id === b.id);
      const onBoard = cards.filter((t) => t.board_id === b.id);
      const touched = onBoard.map(lastTouch).reduce((m, d) => (d > m ? d : m), "");
      const cols = columns.filter((c) => c.board_id === b.id).sort((a, c) => a.position - c.position);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        client: !!b.client_company_id,
        clientCompanyId: b.client_company_id ?? null,
        open: oc.length,
        done: cards.filter((t) => t.board_id === b.id && isDone(t)).length,
        blocked: oc.filter((t) => awake(t) && blockedIds.has(t.id)).length,
        overdue: oc.filter((t) => awake(t) && isOverdue(t)).length,
        oldestDays: Math.max(0, ...oc.map(inColumnDays)),
        finished: finishedOn(b.id),
        columns: cols.map((c) => {
          const cc = oc.filter((t) => t.board_column_id === c.id);
          return { name: c.name, isDone: c.is_done, open: cc.length, oldestDays: Math.max(0, ...cc.map(inColumnDays)) };
        }),
        clientLate: oc
          .filter((t) => awake(t) && t.internal === false)
          .map((t) => ({ id: t.id, title: t.title ?? "(untitled)", lateDays: lateDaysOf(t) }))
          .filter((c) => c.lateDays > CLIENT_LATE_DAYS)
          .sort((x, y) => y.lateDays - x.lateDays),
        oldBlockers: blockers
          .map((k) => ({ card: oc.find((t) => t.id === k.parent_task_id), days: diffDays(k.created_at.slice(0, 10), today) }))
          .filter((x): x is { card: (typeof oc)[number]; days: number } => !!x.card && awake(x.card) && x.days > OLD_BLOCKER_DAYS)
          .map((x) => ({ cardTitle: x.card.title ?? "(untitled)", days: x.days }))
          .sort((x, y) => y.days - x.days),
        lastMoveDays: touched ? diffDays(touched.slice(0, 10), today) : null,
      };
    })
    .filter((b) => b.open + b.done > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));

  const boardById = new Map(boards.map((b) => [b.id, b]));
  const stuck: StuckCard[] = open
    .filter(awake)
    .map((t) => {
      const board = boardById.get(t.board_id ?? "");
      return {
        id: t.id,
        title: t.title ?? "(untitled)",
        boardName: board?.name ?? "",
        boardSlug: board?.slug ?? "",
        column: columnById.get(t.board_column_id ?? "")?.name ?? "",
        due: t.due_date,
        blocked: blockedIds.has(t.id),
        lateDays: lateDaysOf(t),
        daysInColumn: inColumnDays(t),
      };
    })
    .filter((c) => c.boardSlug && (c.blocked || c.lateDays > 0 || c.daysInColumn > STUCK_IN_COLUMN_DAYS))
    .sort((a, b) => Number(b.blocked) - Number(a.blocked) || b.daysInColumn - a.daysInColumn || b.lateDays - a.lateDays);

  return {
    stuck,
    boards: perBoard.length,
    open: open.length,
    // Counted, not derived as "everything not open": a card set aside in Not
    // Doing is neither, and the per-board rows below already count it that way.
    done: cards.filter((t) => isDone(t)).length,
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
  // The columns decide which cards are done (laneStage, A.29.1): a failed
  // read would count every card in a done column as open, which is a wrong
  // answer, so it fails the page. The stage log only ages cards, and without
  // it a card ages from its creation, which is a fair fallback.
  const columns = mustRows(colsRes, "boards: flow board_columns") as FlowColumn[];
  const log = readOr(logRes, "boards: flow task_stage_log", []) as FlowLogRow[];
  return aggregateFlow(boards, columns, tasks, log, now);
}
