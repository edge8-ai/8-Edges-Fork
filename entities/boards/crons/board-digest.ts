import { NextResponse } from "next/server";
import { routineResult, withRoutineRun } from "@/kernel/audit/routine-runs";
import type { RoutineFailure } from "@/kernel/audit/routine-result";
import { companyOs } from "@/kernel/data/supabase";
import { isBoardMember } from "@/entities/boards/lib/access";
import { holdsSurfaceAdmin } from "@/kernel/identity/access-of-person";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { sendTransactionalEmail } from "@/kernel/messaging/email";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { one } from "@/kernel/config/embedded";
import { isWeekend, saigonToday } from "@/kernel/config/dates";
import { greetingName } from "@/kernel/config/people-name";
import { isOverdue } from "@/entities/boards/lib/card-facts";
import { personBoardState } from "@/entities/boards/lib/board-state";
import { readBoardState } from "@/entities/boards/lib/board-state-read";
import { digestHtml, digestSections, digestSubject, type DigestCard } from "@/entities/boards/lib/digest-email";

/**
 * The Vercel cron schedule this routine runs on. Declared here, beside the
 * routine, and written into vercel.json by scripts/gen-deployment.mjs for the
 * entities a deployment installs — an entity left out takes its crons with it.
 * Read as text by the generator, so nothing imports it.
 * @generator
 */
export const schedule = "15 1 * * 1-5";

/**
 * What Settings -> Agents says about this routine (Y.14). Read as text by
 * scripts/gen-deployment.mjs into kernel/audit/automations.json, so it keeps
 * one literal shape: double-quoted strings and arrays of them, nothing computed.
 * @generator
 */
export const automation = {
  name: "Board digest",
  description: "Weekdays. Emails each active team member their open board cards, sectioned by column and ordered by priority, overdue flagged. A card on a board they can no longer open is named without a link.",
  content: ["Board cards"],
  apps: ["Supabase", "Resend"],
};

// Vercel cron (see vercel.json): weekdays 01:15 UTC (08:15 Asia/Ho_Chi_Minh),
// like the daily check-in and its reminder (U.2). It used to run every day,
// so the team's inboxes got a work digest on Saturday and Sunday mornings.
// Emails each active team member a summary of their open board cards,
// sectioned by column and ordered by priority, overdue flagged. Skips anyone
// with nothing assigned.
type PersonEmbed = {
  email: string;
  full_name: string | null;
  preferred_name: string | null;
  first_name: string | null;
  display_name: string | null;
};
type MemberRow = { id: string; person_id: string; people: PersonEmbed | PersonEmbed[] | null };

async function handler(_req: Request) {
  const today = saigonToday();
  // The schedule already leaves the weekend out; this also holds a run by
  // hand to it, as the daily check-in does.
  if (isWeekend(today)) return routineResult({ status: "skipped", reason: "weekend" });

  // The one board read every reporting agent makes (U.2), so the cards and
  // lanes here are the ones the check-in and the weekly summary count. The
  // digest used to read the tasks table on its own.
  const board = await readBoardState();
  const boardById = new Map(board.boards.map((b) => [b.id, b]));
  const assigneeIds = [
    ...new Set(board.cards.filter((c) => c.status === "open" && c.assignee_id).map((c) => c.assignee_id as string)),
  ];

  // Only email people who are active team members.
  const members = new Map<string, { teamMemberId: string; person: PersonEmbed }>();
  if (assigneeIds.length) {
    const { data: tms, error: tmsError } = await companyOs
      .from("team_members")
      .select("id, person_id, people:people!person_id(email, full_name, preferred_name, first_name, display_name)")
      .in("person_id", assigneeIds)
      .eq("status", "active");
    if (tmsError) {
      return NextResponse.json({ error: tmsError.message }, { status: 500 });
    }
    for (const t of (tms ?? []) as unknown as MemberRow[]) {
      const person = one(t.people);
      if (person?.email) members.set(t.person_id, { teamMemberId: t.id, person });
    }
  }

  // A digest is an invitation to open the board, so it links only boards the
  // reader still can. An assignee whose client assignment ended keeps
  // assignee_id on old cards; a link boardActorFor will deny is worse than no
  // link (W.5). One access check per (board, person), memoised.
  // Admins can open every board (boardActorFor admits them before membership
  // is asked), so an admin assignee is never refused.
  const access = new Map<string, Promise<boolean>>();
  const canOpen = (boardId: string, personId: string, teamMemberId: string, email: string) => {
    const key = `${boardId}:${personId}`;
    if (!access.has(key)) {
      access.set(
        key,
        // A failed read leaves only the board's members as linked: no is the safe side here.
        (async () => (await holdsSurfaceAdmin(email).catch(() => false)) || (await isBoardMember(boardId, personId, teamMemberId)))(),
      );
    }
    return access.get(key) as Promise<boolean>;
  };
  // And it links to pages, which are never a side door (ADR 0013): a card is
  // linked only when the reader may open the board page it links to, by that
  // page's declared permission. Each recipient's access is resolved once per
  // run, however many cards they have.
  const pages = new Map<string, Promise<(href: string) => boolean>>();
  const pagesOf = (personId: string) => {
    if (!pages.has(personId)) pages.set(personId, recipientMayOpen(personId));
    return pages.get(personId) as Promise<(href: string) => boolean>;
  };

  const laneOrder = board.lanes.map((l) => l.name);
  const digests: { personId: string; name: string; email: string; cards: DigestCard[] }[] = [];
  let withheldForAccess = 0;
  for (const [personId, { teamMemberId, person }] of members) {
    // A card in a done column is done, as every board shows it (W.111), and
    // the reader counts open work by the same rule as the other two agents.
    const { open } = personBoardState(board, personId, Date.now());
    if (open.length === 0) continue;
    const mayOpen = await pagesOf(personId);
    const cards: DigestCard[] = [];
    for (const c of open) {
      const b = c.board_id ? boardById.get(c.board_id) : undefined;
      const linked =
        b !== undefined && (await canOpen(b.id, personId, teamMemberId, person.email)) && mayOpen(`/team/boards/${b.slug}`);
      // A card withheld for access used to be dropped from the email and
      // counted only in the run log, so the one person who could act on it
      // never heard of it (U.2). It is named in their own digest instead, in
      // its column, without the link they may not follow.
      if (!linked) withheldForAccess += 1;
      cards.push({
        title: c.title,
        lane: c.laneId,
        priority: c.priority,
        due: c.due_date,
        // The board's one rule (card-facts.ts, A.29.1), so the red "(overdue)"
        // in the email is the amber on the card it links to.
        overdue: isOverdue({ status: c.status, due_date: c.due_date }, today),
        board: linked && b ? { name: b.name, slug: b.slug } : null,
      });
    }
    digests.push({ personId, name: greetingName(person, "there"), email: person.email, cards });
  }

  const origin = await getSiteOrigin();
  let emailed = 0;
  const failures: RoutineFailure[] = [];
  for (const d of digests) {
    const html = digestHtml({
      name: d.name,
      origin,
      sections: digestSections(d.cards, laneOrder),
      workboard: (await pagesOf(d.personId))("/team/workboard"),
    });
    const ok = await sendTransactionalEmail({
      to: d.email,
      subject: digestSubject(d.cards.length),
      html,
      logMeta: { kind: "board-digest", count: d.cards.length },
    });
    if (ok) emailed++;
    // A digest that was not sent names its recipient, so a run that mailed
    // fewer people than it had cards for is an error run that says who went
    // without (Y.20), and the repeated-failure alert can fire on it.
    else failures.push({ subject: `person ${d.personId}`, step: "email", error: "the digest email was not sent" });
  }

  return routineResult({ status: "ok", recipients: digests.length, emailed, withheldForAccess, failures });
}

// Every scheduled run is recorded in company_os.routine_runs (Settings -> Agents).
export const GET = (req: Request) => withRoutineRun("/api/cron/board-digest/", req, handler);
