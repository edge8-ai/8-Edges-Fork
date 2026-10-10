import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { recordAudit } from "@/kernel/audit/audit";
import { companyOs } from "@/kernel/data/supabase";
import { selectCompanies } from "@/kernel/identity/reads";
import { saigonToday } from "@/kernel/config/dates";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { notifyEo, notifyMarketing, notifyOps, notifyProduct } from "@/kernel/messaging/lark";
import { refresh } from "@/entities/boards/lib/card-helpers";
import { draftSprint, type SprintDraft } from "@/entities/boards/lib/sprint-draft";
import { renderSprintNotice, type SprintNoticeBoard } from "@/entities/boards/lib/sprint-notice";
import {
  SPRINT_CHATS,
  nextSprintName,
  planningDayOnOrAfter,
  sprintCovering,
  sprintWeek,
  sprintWindow,
  weeklySprintChat,
  type SprintChat,
} from "@/entities/boards/lib/sprint-cadence";
import { BOARD_SELECT, SPRINT_SELECT, type BoardRow, type SprintRow } from "@/entities/boards/lib/types";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 1 * * 1";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Weekly sprints",
  description: "Mondays. Opens next week's sprint (Wednesday to Tuesday) on every board with weekly sprints switched on, drafts its name and goal from the open cards, and sends each board's team chat the sprint planning board with a link to every new sprint.",
  content: ["Boards", "Sprints", "Board cards"],
  apps: ["Supabase", "Anthropic", "Lark"],
};

// Vercel cron (see vercel.json): Monday 01:00 UTC (08:00 Asia/Ho_Chi_Minh).
// Weekly sprints (WS-01): on every board that switched them on (Board
// settings), open next week's sprint, Wednesday to Tuesday, named by the
// board's own count with a theme and goal drafted from its open cards; then
// send each board's team chat the sprint planning board (SP-01) with a link
// to each new sprint, so the team spends Monday and Tuesday moving what is
// not done and making the drafted name and goal its own. A board whose sprint
// already covers the week is left alone and named as already planned, so a
// second run in the same week opens nothing twice. The ending sprint is not
// closed here: that is Finish planning on the planning board.
const SEND: Record<SprintChat, typeof notifyOps> = {
  product: notifyProduct,
  eo: notifyEo,
  ops: notifyOps,
  // The Revenue chat is the old Marketing chat, so its sender kept that name.
  revenue: notifyMarketing,
};
// Named in the failure so the run says what to fix, not just that it broke.
const WEBHOOK_ENV: Record<SprintChat, string> = {
  product: "LARK_PRODUCT_WEBHOOK_URL",
  eo: "LARK_EO_WEBHOOK_URL",
  ops: "LARK_OPS_WEBHOOK_URL",
  revenue: "LARK_MARKETING_WEBHOOK_URL",
};

type Failure = { subject: string; step: string; error: string };
type Flagged = { board: BoardRow; chat: SprintChat };
type OpenCard = { board_id: string; title: string; priority: string };
type DoneCard = { board_id: string; title: string };
const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

const groupBy = <T extends { board_id: string }>(rows: T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.board_id, [...(out.get(r.board_id) ?? []), r]);
  return out;
};

async function handler(_req: Request) {
  const planningDay = planningDayOnOrAfter(saigonToday());
  const window = sprintWindow(planningDay);

  const boardsRes = await companyOs.from("boards").select(BOARD_SELECT).eq("status", "active").is("archived_at", null).order("sort_order");
  if (boardsRes.error) return NextResponse.json({ error: boardsRes.error.message }, { status: 500 });
  const flagged: Flagged[] = [];
  for (const board of (boardsRes.data ?? []) as BoardRow[]) {
    const chat = weeklySprintChat(board);
    if (chat) flagged.push({ board, chat });
  }
  if (flagged.length === 0) return routineResult({ status: "skipped", reason: "no board has weekly sprints switched on", planningDay });

  const boardIds = flagged.map((f) => f.board.id);
  // Newest first, so a board's first row is the sprint the new one follows.
  const sprintsRes = await companyOs
    .from("sprints")
    .select(SPRINT_SELECT)
    .in("board_id", boardIds)
    .order("starts_on", { ascending: false, nullsFirst: false });
  if (sprintsRes.error) return NextResponse.json({ error: sprintsRes.error.message }, { status: 500 });
  const sprintsByBoard = groupBy((sprintsRes.data ?? []) as SprintRow[]);
  const previousIds = boardIds.map((id) => sprintsByBoard.get(id)?.[0]?.id).filter(Boolean) as string[];
  const clientIds = [...new Set(flagged.map((f) => f.board.client_company_id).filter(Boolean) as string[])];

  // The draft's raw material and the notice's client names. None of these can
  // stop the sprints from opening: a failure here is logged and the draft or
  // the label goes without.
  const [openRes, doneRes, clientsRes] = await Promise.all([
    companyOs.from("tasks").select("board_id, title, priority").in("board_id", boardIds).eq("status", "open").is("archived_at", null).is("parent_task_id", null),
    previousIds.length
      ? companyOs.from("tasks").select("board_id, title").in("sprint_id", previousIds).eq("status", "done").is("archived_at", null).is("parent_task_id", null)
      : Promise.resolve({ data: [] as DoneCard[], error: null }),
    clientIds.length
      ? selectCompanies("id, name").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  for (const [label, res] of [["tasks", openRes], ["tasks", doneRes], ["companies", clientsRes]] as const) {
    if (res.error) console.error(`[weekly-sprints] ${label}`, res.error.message);
  }
  const openByBoard = groupBy((openRes.data ?? []) as OpenCard[]);
  const doneByBoard = groupBy((doneRes.data ?? []) as DoneCard[]);
  const clientName = new Map(((clientsRes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const origin = await getSiteOrigin();

  // Every board's line in its chat's notice, then the sprints that still need
  // opening. The drafts run together: one model call per board, and the
  // routine should not spend its minute waiting on them in turn.
  const lines = new Map<SprintChat, SprintNoticeBoard[]>();
  const pending: { f: Flagged; line: SprintNoticeBoard; draft: Promise<SprintDraft> }[] = [];
  let covered = 0;
  let empty = 0;
  for (const f of flagged) {
    const { board } = f;
    const own = sprintsByBoard.get(board.id) ?? [];
    // A board that has never had a sprint and holds no open card has nothing
    // to plan, so it gets no sprint and no line in its chat's notice (EO
    // Vietnam was handed an empty "Sprint 1" on 2026-09-21). Only when the
    // cards were actually read: a failed read must not make every board look empty.
    if (!openRes.error && own.length === 0 && !openByBoard.get(board.id)?.length) {
      empty += 1;
      continue;
    }
    const line: SprintNoticeBoard = {
      client: board.client_company_id ? clientName.get(board.client_company_id) ?? null : null,
      board: board.name,
      url: origin ? `${origin}/team/boards/${board.slug}` : null,
      sprintUrl: null,
      created: null,
      covered: null,
      failed: null,
    };
    lines.set(f.chat, [...(lines.get(f.chat) ?? []), line]);
    const existing = sprintCovering(own, window);
    if (existing) {
      line.covered = existing.name;
      covered += 1;
      continue;
    }
    const previous = own[0] ?? null;
    const open = [...(openByBoard.get(board.id) ?? [])].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
    const draft = draftSprint({
      board: board.name,
      description: board.description,
      client: line.client,
      previous: previous ? { name: previous.name, goal: previous.goal } : null,
      open: open.map((c) => ({ title: c.title, priority: c.priority })),
      finished: (doneByBoard.get(board.id) ?? []).map((c) => c.title),
    });
    pending.push({ f, line, draft });
  }

  let created = 0;
  const failures: Failure[] = [];
  for (const { f, line, draft } of pending) {
    const { board } = f;
    const { theme, goal } = await draft;
    const name = nextSprintName(sprintsByBoard.get(board.id) ?? [], theme);
    const row = { board_id: board.id, name, goal, starts_on: window.startsOn, ends_on: window.endsOn, status: "active", week: sprintWeek(window.startsOn) };
    const { data, error } = await companyOs.from("sprints").insert(row).select("id").single();
    if (error) {
      line.failed = error.message;
      failures.push({ subject: board.name, step: "open sprint", error: error.message });
      continue;
    }
    line.created = { name, goal };
    line.sprintUrl = origin ? `${origin}/team/boards/${board.slug}/sprints/${(data as { id: string }).id}` : null;
    created += 1;
    await recordAudit({ table: "sprints", recordId: (data as { id: string }).id, operation: "insert", actor: "weekly-sprints", newData: row });
    refresh(board.slug);
  }

  // One card per chat, in the chats' fixed order. A chat counts as told only
  // when Lark took the card, and an untaken one fails the run naming the
  // variable to set, as the check-in reminder does.
  const posted: SprintChat[] = [];
  const undelivered: Failure[] = [];
  for (const chat of SPRINT_CHATS) {
    const boards = lines.get(chat.key);
    if (!boards) continue;
    const ok = await SEND[chat.key](renderSprintNotice({ planningDay, ...window, planningUrl: origin ? `${origin}/team/sprint-planning` : null, boards }), { category: "workboard" });
    if (ok) posted.push(chat.key);
    else undelivered.push({ subject: `${chat.label} chat`, step: "notice", error: `Lark did not accept the notice (${WEBHOOK_ENV[chat.key]})` });
  }

  // A sprint that did not open or a chat that heard nothing is a failure that
  // names the board or the chat, so the run shows red on Settings → Agents (Y.20).
  return routineResult({
    status: "ok",
    planningDay,
    startsOn: window.startsOn,
    endsOn: window.endsOn,
    created,
    covered,
    empty,
    posted,
    failures: [...failures, ...undelivered],
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/weekly-sprints/", req, handler, "vercel", { stepSeconds: 60 });
