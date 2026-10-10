import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { companyOs } from "@/kernel/data/supabase";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { notifyOps } from "@/kernel/messaging/lark";
import { cardsForIdeas, type IdeaCard } from "@/entities/boards";
import { escapeHtml } from "@/kernel/config/html";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { one } from "@/kernel/config/embedded";
import { OPS_EMAIL } from "@/kernel/config/contacts";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "0 0 * * 2";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Ideas digest",
  description: "Weekly, Tuesday morning. Emails the founder and posts to Lark ops a warm round-up of what the team shared in Spark this week and which sparks were picked up or shipped, ending with an open invitation to share one.",
  content: ["Idea submissions", "Cards picked up from ideas"],
  apps: ["Supabase", "Lark", "Resend"],
};

// Route-handler Supabase reads get frozen by Next's data cache despite
// force-dynamic; opt the whole handler out so each run sees fresh rows.
// Vercel cron (see vercel.json): weekly, Tuesday 00:00 UTC (07:00
// Asia/Ho_Chi_Minh). The Spark weekly round-up: what the team chose to share
// in the last seven days (ideas and learnings), and which sparks a teammate
// picked up or shipped, emailed to the founder and posted to Lark ops.
//
// It is encouragement, never a register (TH.7.1, 2026-10-09). It used to list
// everyone in Product and EO who had not posted and DM each of them a nudge,
// which turned a place for sharing ideas into an obligation. Ideas come when
// people want to give them, so nothing here reads the roster, names or counts
// anyone who did not post, or messages a person on their own. A name appears
// only beside a spark that person chose to share or picked up: credit, not
// tracking.
//
// Always runs, even a quiet week: a quiet week gets a warm invitation, not
// silence. This routine keeps the ideas-digest route id so its run history
// carries on.
const FOUNDER_EMAIL = OPS_EMAIL;
const WINDOW_HOURS = 24 * 7;
// The sparks whose cards are checked for movement: the newest 200, the same
// window /team/ideas reads, so the digest and the page agree on what moved.
const MOVED_WINDOW_SPARKS = 200;
const TEAM_IDEAS_PATH = "/team/ideas";

type DigestRow = {
  id: string;
  kind: string;
  title: string;
  takeaway: string | null;
  created_at: string;
  person_id: string | null;
  people: (NamedPerson & { email: string }) | null;
};

// Exported for its test.
export function submitter(row: DigestRow): string {
  return personName(one(row.people), "Someone");
}

/** A spark that moved this week: picked up by a teammate, or shipped. */
export type MovedSpark = { title: string; who: string | null };

export type DigestWeek = {
  builds: DigestRow[];
  learnings: DigestRow[];
  pickedUp: MovedSpark[];
  shipped: MovedSpark[];
  ideasUrl: string;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The sparks that moved in the window, from the cards picked up off them
 * (ID.2.8). A card done in the window is Shipped; a card opened in the window
 * and not set aside is Picked up. A card set aside says nothing.
 */
export function movedThisWeek(
  cards: IdeaCard[],
  titles: Map<string, string>,
  since: string,
): { pickedUp: MovedSpark[]; shipped: MovedSpark[] } {
  const pickedUp: MovedSpark[] = [];
  const shipped: MovedSpark[] = [];
  for (const c of cards) {
    const title = titles.get(c.ideaId);
    if (!title || c.status === "not_doing") continue;
    if (c.status === "done" && (c.completedAt ?? "") >= since) shipped.push({ title, who: c.assigneeName });
    else if (c.status !== "done" && c.createdAt >= since) pickedUp.push({ title, who: c.assigneeName });
  }
  return { pickedUp, shipped };
}

/**
 * The subject, email and Lark post for one week. Pure, so the copy can be
 * tested on its own: it celebrates what was shared and what moved, and ends
 * with an open invitation. It has no input that could name someone who did
 * not post, which is the point.
 */
export function composeDigest(week: DigestWeek): { subject: string; html: string; lark: string } {
  const { builds, learnings, pickedUp, shipped, ideasUrl } = week;
  const shared = builds.length + learnings.length;
  const moved = pickedUp.length + shipped.length;

  const parts = [
    builds.length ? plural(builds.length, "idea") : "",
    learnings.length ? plural(learnings.length, "learning") : "",
    shipped.length ? `${shipped.length} shipped` : "",
  ].filter(Boolean);
  const subject = parts.length
    ? `This week in Spark: ${parts.join(", ")}`
    : "A quiet week in Spark — the sky is waiting for your next one";

  const sparkList = (items: DigestRow[]) =>
    `<ul>${items
      .map(
        (r) =>
          `<li><strong>${escapeHtml(r.title)}</strong>, shared by ${escapeHtml(submitter(r))}` +
          `${r.takeaway ? `<br/>${escapeHtml(r.takeaway)}` : ""}</li>`,
      )
      .join("")}</ul>`;
  const movedList = (items: MovedSpark[], verb: string) =>
    `<ul>${items
      .map((m) => `<li><strong>${escapeHtml(m.title)}</strong>${m.who ? `, ${verb} by ${escapeHtml(m.who)}` : ""}</li>`)
      .join("")}</ul>`;

  const opening = shared
    ? `<p>Here is what the team shared in Spark this week. Thank you to everyone who put a thought out there.</p>`
    : moved
      ? `<p>No new sparks this week, and earlier ones kept moving.</p>`
      : `<p>It was a quiet week in Spark. That is fine: good ideas turn up when they are ready.</p>`;
  const invitation =
    `<p>Noticed something that could be easier, or learned something worth passing on? ` +
    `The sky is open whenever you are: <a href="${ideasUrl}">share a spark</a>.</p>`;
  const html =
    opening +
    (builds.length ? `<h3>Ideas</h3>${sparkList(builds)}` : "") +
    (learnings.length ? `<h3>Learnings</h3>${sparkList(learnings)}` : "") +
    (shipped.length ? `<h3>Shipped</h3>${movedList(shipped, "shipped")}` : "") +
    (pickedUp.length ? `<h3>Picked up</h3>${movedList(pickedUp, "picked up")}` : "") +
    invitation;

  const credit = (r: DigestRow) => `- ${r.kind === "learning" ? "Learning" : "Idea"}: ${r.title} (${submitter(r)})`;
  const all = [...builds, ...learnings];
  const lark = [
    subject,
    ...all.slice(0, 10).map(credit),
    all.length > 10 ? `...and ${all.length - 10} more` : "",
    ...shipped.map((m) => `- Shipped: ${m.title}${m.who ? ` (${m.who})` : ""}`),
    ...pickedUp.map((m) => `- Picked up: ${m.title}${m.who ? ` (${m.who})` : ""}`),
    `Share a spark: ${ideasUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, lark };
}

async function handler() {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const failures: RoutineFailure[] = [];

  // 1. What the team shared this week.
  const { data, error } = await companyOs.from("ideas").select(
      `id, kind, title, takeaway, created_at, person_id, people:people!person_id(${NAME_COLUMNS})`,
    )
    .gte("created_at", since)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as unknown as DigestRow[];
  const builds = rows.filter((r) => r.kind !== "learning");
  const learnings = rows.filter((r) => r.kind === "learning");

  // 2. What moved. A failed read is a named failure and the section is left
  // out, never shown as "nothing moved": the shared sparks still go out, and
  // the run is marked an error so someone looks.
  let pickedUp: MovedSpark[] = [];
  let shipped: MovedSpark[] = [];
  const { data: sparkData, error: sparkError } = await companyOs
    .from("ideas")
    .select("id, title")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(MOVED_WINDOW_SPARKS);
  if (sparkError) {
    failures.push({ subject: "what moved", step: "read the sparks", error: sparkError.message });
  } else {
    const sparks = (sparkData ?? []) as { id: string; title: string }[];
    try {
      const cards = await cardsForIdeas(sparks.map((s) => s.id));
      ({ pickedUp, shipped } = movedThisWeek(cards, new Map(sparks.map((s) => [s.id, s.title])), since));
    } catch (err) {
      failures.push({ subject: "what moved", step: "read the picked-up cards", error: err instanceof Error ? err.message : String(err) });
    }
  }

  const origin = await getSiteOrigin();
  const { subject, html, lark } = composeDigest({ builds, learnings, pickedUp, shipped, ideasUrl: `${origin}${TEAM_IDEAS_PATH}` });

  // 3. The founder email. The recipient is unchanged; whether the round-up
  // goes to the whole team is Khoa's open decision (TH.7.1).
  const emailOk = await sendTransactionalEmail({ to: FOUNDER_EMAIL, subject, html });
  if (!emailOk) failures.push({ subject: "founder email", step: "send the digest email", error: "the email was not sent" });

  // 4. The same round-up to the Operations channel. A channel post only: no
  // person is messaged on their own.
  if (!(await notifyOps(lark))) {
    failures.push({ subject: "Operations summary", step: "post to Lark", error: "Lark did not accept the summary (LARK_OPS_WEBHOOK_URL)" });
  }

  return routineResult({
    status: "ok",
    since,
    ideas: builds.length,
    learnings: learnings.length,
    pickedUp: pickedUp.length,
    shipped: shipped.length,
    emailSent: emailOk,
    failures,
  });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/ideas-digest/", req, handler);
