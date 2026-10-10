import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import { readOr } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { saigonToday } from "@/kernel/config/dates";
import { cardSlug } from "@/kernel/config/slug";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { failureOf, notify } from "@/kernel/messaging/router";
import { renderClosedCardsNotice, type ClosedCardsBoard } from "@/entities/boards/lib/closed-cards-notice";
import { weeklySprintChat } from "@/entities/boards/lib/sprint-cadence";
import { BOARD_SELECT, type BoardRow } from "@/entities/boards/lib/types";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 11 * * *";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Revenue closed cards",
  description: "Daily at 18:00. Lists every card closed in the last day on the boards that report to the Revenue chat, each linking to its card, and the notification router holds the post to 08:30 the next working morning. A quiet day posts nothing.",
  content: ["Boards", "Board cards"],
  apps: ["Supabase", "Lark"],
};

// Vercel cron (see vercel.json): daily 11:00 UTC (18:00 Asia/Ho_Chi_Minh).
// The Revenue chat's end-of-day post (Dave, 2026-09-24): every card closed
// since the last post on a board whose weekly sprints report to the Revenue
// chat, so sales and marketing see what moved without opening the board. The
// window is the time since the last run rather than the calendar day, so a card
// closed after the post still reaches the next one, and none reaches two. A
// quiet day posts nothing: an empty card every evening would teach the chat to
// skip it.
//
// "Since the last run" is read, not assumed (R.22). Each run records in its
// body the instant its read was bounded by (`until`), and the next run starts
// there. A fixed 24-hour look-back silently dropped every card closed during a
// missed or late run. Only an `ok` run counts: a quiet day is ok too, while a
// post Lark refused is a 500 (`error`), so its cards roll into the next run.
//
// The post goes through the notification router (Z.7.1). 18:00 is the first
// minute of quiet hours, so the router holds it in the notification queue
// until 08:30 the next working morning, and Friday's, Saturday's and Sunday's
// wait for Monday. A held post is this run's job done: its window is closed
// and the flush owns the send, retrying it through the working day. The
// dedupe key is the window's start, so two runs that read the same window (a
// Run-now racing the cron) post it once, and a post that failed releases the
// key for the next run, which starts at the same place.
type ClosedCard = { id: string; board_id: string; title: string };

const ROUTINE_ID = "/api/cron/revenue-closed-cards/";
const DAY_MS = 24 * 60 * 60 * 1000;
// A long outage should not end in a month of cards in one post: the chat reads
// a week of catch-up as news, and anything older is on the board already.
const MAX_LOOKBACK_MS = 7 * DAY_MS;

/**
 * Where this run's window starts: the last good run's `until`, never more
 * than a week back. With no earlier run, or one from before runs recorded an
 * `until`, it is 24 hours ago, which is what every run did before R.22.
 */
async function windowStart(now: number): Promise<string> {
  const res = await companyOs
    .from("routine_runs")
    .select("result")
    .eq("routine_id", ROUTINE_ID)
    .eq("status", "ok")
    .order("started_at", { ascending: false })
    .limit(1);
  // A failed read falls back to the last 24 hours rather than failing the
  // run: that was this routine's behaviour before it read its history, so the
  // worst a failure costs is the gap the fixed window always had, and failing
  // instead would post nothing at all.
  const rows = readOr(res, "[boards/revenue-closed-cards] last ok run", []) as { result: unknown }[];
  const until = (rows[0]?.result as { until?: unknown } | null | undefined)?.until;
  const last = typeof until === "string" ? Date.parse(until) : Number.NaN;
  if (!Number.isFinite(last)) return new Date(now - DAY_MS).toISOString();
  return new Date(Math.min(now, Math.max(last, now - MAX_LOOKBACK_MS))).toISOString();
}

async function handler(_req: Request) {
  const boardsRes = await companyOs.from("boards").select(BOARD_SELECT).eq("status", "active").is("archived_at", null).order("sort_order");
  if (boardsRes.error) return NextResponse.json({ error: boardsRes.error.message }, { status: 500 });
  const boards = ((boardsRes.data ?? []) as BoardRow[]).filter((b) => weeklySprintChat(b) === "revenue");
  if (boards.length === 0) return routineResult({ status: "skipped", reason: "no board reports to the Revenue chat" });

  // `until` is taken just before the read and bounds it, so a card closed
  // while the read runs is not in this post and is in the next one.
  const now = Date.now();
  const since = await windowStart(now);
  const until = new Date(now).toISOString();
  // A failed read must fail the run: posting nothing would read as a quiet day.
  const cardsRes = await companyOs
    .from("tasks")
    .select("id, board_id, title")
    .in("board_id", boards.map((b) => b.id))
    .eq("status", "done")
    .gte("completed_at", since)
    .lt("completed_at", until)
    .is("archived_at", null)
    .is("parent_task_id", null)
    .order("completed_at");
  if (cardsRes.error) return NextResponse.json({ error: cardsRes.error.message }, { status: 500 });
  const closed = (cardsRes.data ?? []) as ClosedCard[];
  // A quiet day stays "ok" rather than "skipped": windowStart reads only ok
  // runs for the last `until`, and a quiet day's `until` is a real bound.
  if (closed.length === 0) return routineResult({ status: "ok", since, until, closed: 0, posted: false });

  const origin = await getSiteOrigin();
  const lists: ClosedCardsBoard[] = boards
    .map((b) => {
      const url = origin ? `${origin}/team/boards/${b.slug}` : null;
      const cards = closed
        .filter((c) => c.board_id === b.id)
        .map((c) => ({ title: c.title, url: url ? `${url}?card=${cardSlug(c.title, c.id)}` : null }));
      return { board: b.name, url, cards };
    })
    .filter((b) => b.cards.length > 0);

  const posted = await notify({
    kind: "revenue.closed-cards",
    to: { chat: "revenue" },
    message: renderClosedCardsNotice({ day: saigonToday(), boards: lists }),
    dedupeKey: `boards:revenue-closed-cards:${since}`,
  });
  // A post Lark refused, or a webhook that is not set, is a failure the router
  // names, so the run shows red on Settings → Agents and its cards roll into
  // the next run.
  return routineResult({
    status: "ok",
    since,
    until,
    closed: closed.length,
    posted: posted.status !== "failed",
    notice: posted.status,
    failures: failureOf(posted, "Revenue chat", "post"),
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun(ROUTINE_ID, req, handler, "vercel", { stepSeconds: 60 });
