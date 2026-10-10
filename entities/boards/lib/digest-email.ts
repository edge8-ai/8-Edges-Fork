import { escapeHtml } from "@/kernel/config/html";
import { PALETTE } from "@/kernel/config/palette";
import { TASK_PRIORITIES } from "./types";

// The morning board digest's email (U.2), composed from cards the cron has
// already read and checked. Pure, so the layout is tested without a board or
// a mail provider.
//
// The digest used to be one list ordered by due date, so a P1 card with no
// date sat under every dated P3 and the reader could not tell what was in
// progress from what was waiting. It is now sectioned by the column each card
// sits in, in the board's column order, and ordered by priority inside each
// section, then by due date, oldest first.

/** An open card the reader holds, as the digest lists it. */
export type DigestCard = {
  title: string;
  /** The lane the card sits in: its column's name. */
  lane: string;
  priority: string;
  due: string | null;
  overdue: boolean;
  /**
   * The board the card links to, or null when the card is withheld for
   * access: the reader holds it on a board they can no longer open, so it is
   * named without a link and without the board.
   */
  board: { name: string; slug: string } | null;
};

export type DigestSection = { lane: string; cards: DigestCard[] };

const PRIORITY_RANK = new Map<string, number>(TASK_PRIORITIES.map((p, i) => [p, i]));
const rank = (priority: string) => PRIORITY_RANK.get(priority) ?? TASK_PRIORITIES.length;

/**
 * The reader's cards grouped by lane, in `laneOrder` (the board's column
 * order), with a lane the order does not name placed last. Inside a lane:
 * priority first, then due date oldest first with undated cards after the
 * dated ones, then title, so the order is the same every morning.
 */
export function digestSections(cards: DigestCard[], laneOrder: string[]): DigestSection[] {
  const byLane = new Map<string, DigestCard[]>();
  for (const c of cards) byLane.set(c.lane, [...(byLane.get(c.lane) ?? []), c]);
  const position = (lane: string) => {
    const at = laneOrder.indexOf(lane);
    return at === -1 ? laneOrder.length : at;
  };
  return [...byLane.entries()]
    .sort(([a], [b]) => position(a) - position(b) || a.localeCompare(b))
    .map(([lane, list]) => ({
      lane,
      cards: [...list].sort(
        (a, b) =>
          rank(a.priority) - rank(b.priority) ||
          (a.due ?? "9999").localeCompare(b.due ?? "9999") ||
          a.title.localeCompare(b.title),
      ),
    }));
}

function fmtDue(iso: string | null): string {
  if (!iso) return "no due date";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const tasks = (n: number) => `${n} open task${n === 1 ? "" : "s"}`;

/** The subject line: every open card the reader holds, withheld ones included. */
export function digestSubject(open: number): string {
  return `Your Edge8 boards: ${tasks(open)}`;
}

/**
 * The email body. It counts and sections every open card the reader holds,
 * the withheld ones too, so its numbers match the check-in and the weekly
 * summary for the same person on the same day. A withheld card is named in
 * its column without a link, because the link would open a page the reader
 * may not open, and a closing line says what to do about it.
 */
export function digestHtml(input: {
  name: string;
  origin: string;
  sections: DigestSection[];
  /** Whether the reader may open the Workboard, which decides the closing link. */
  workboard: boolean;
}): string {
  const { name, origin, sections, workboard } = input;
  const open = sections.reduce((n, s) => n + s.cards.length, 0);
  const withheld = sections.reduce((n, s) => n + s.cards.filter((c) => !c.board).length, 0);
  const meta = (text: string) => `<span style="font-size:13px;color:${PALETTE.inkBody}">${escapeHtml(text)} · </span>`;
  const item = (c: DigestCard) => {
    const due = c.overdue
      ? `<span style="color:${PALETTE.errInk};font-weight:600">${escapeHtml(fmtDue(c.due))} (overdue)</span>`
      : `<span style="color:${PALETTE.inkBody}">${escapeHtml(fmtDue(c.due))}</span>`;
    const priority = c.priority.toUpperCase();
    if (!c.board) {
      return `<li style="margin:0 0 8px"><span style="font-weight:600">${escapeHtml(c.title)}</span><br>${meta(
        `${priority} · on a board you can no longer open`,
      )}${due}</li>`;
    }
    return `<li style="margin:0 0 8px"><a href="${origin}/team/boards/${escapeHtml(c.board.slug)}" style="color:${PALETTE.blue};text-decoration:none;font-weight:600">${escapeHtml(
      c.title,
    )}</a><br>${meta(`${priority} · ${c.board.name}`)}${due}</li>`;
  };
  const section = (s: DigestSection) =>
    `<p style="font-size:14px;font-weight:600;margin:16px 0 6px">${escapeHtml(s.lane)} (${s.cards.length})</p>
      <ul style="padding-left:18px;font-size:15px;margin:0">${s.cards.map(item).join("")}</ul>`;
  const withheldNote = withheld
    ? `<p style="font-size:14px;color:${PALETTE.greyMid};margin-top:16px">${
        withheld === 1 ? "One card is" : `${withheld} cards are`
      } assigned to you on a board you can no longer open, so ${withheld === 1 ? "it has" : "they have"} no link. Ask the board's owner to add you back or to reassign ${withheld === 1 ? "it" : "them"}.</p>`
    : "";
  const workboardLink = workboard
    ? `<p style="font-size:14px"><a href="${origin}/team/workboard" style="color:${PALETTE.blue}">Open the Workboard →</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:${PALETTE.dark}">
      <p style="font-size:16px">Morning ${escapeHtml(name)},</p>
      <p style="font-size:15px;color:${PALETTE.greyMid}">You have ${tasks(open)} across your boards:</p>
      ${sections.map(section).join("")}
      ${withheldNote}
      ${workboardLink}
    </div>`;
}
