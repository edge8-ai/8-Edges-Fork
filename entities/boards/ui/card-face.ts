// The words on a card's face on the board, as the approved canvas reads them
// (W.160; https://claude.ai/artifact/EwRwp6V5VYUGgBuxxu5R6W, "Card faces on the
// board"). Pure, so the wording is pinned by tests without a DOM.

import { businessDate } from "@/kernel/config/dates";
import type { CardPrState } from "@/entities/boards/lib/types";
import { prPillLabel } from "./card-pills";
import { chipDate, shortDate } from "./card-chips";

/** The one date on a card's meta line, and what kind of date it is. */
export type FaceDate = { text: string; kind: "due" | "overdue" | "done" | "not-doing" };

/**
 * A card that is closed, whether finished (`done`) or set aside
 * (`not_doing`). Both are history: the face mutes the title and drops the
 * priority, the size and the date edit, because none of them is a question
 * anybody still has to answer about the card (bug hunt F14).
 */
export function isClosedCard(card: { status: string }): boolean {
  return card.status === "done" || card.status === "not_doing";
}

/**
 * "Sat 10 Oct" for a due date, "Overdue · 2 Oct" for a late one, "Done 3 Oct"
 * for finished work, "Not doing" for work set aside, or null when there is
 * nothing to say.
 *
 * Overdue is said in WORDS as well as in the error colour, because a colour
 * is never the only thing carrying a meaning, and the weekday goes once the
 * word is there: "Overdue · Thu 2 Oct" is a line too long for what it says.
 * A finished card dates its completion, not its old due date, which no longer
 * matters; the completion is a timestamp, read as the business day it fell on.
 *
 * A card set aside says what happened and no date (bug hunt F14). Its old due
 * date read as an ordinary date, often a past one, on work nobody owes. Not
 * Doing leaves completed_at empty on purpose (it means finished to every
 * report), and the card's latest column move is not proof of when it was set
 * aside — a parent's move closes its children without moving them — so a date
 * here would be a guess.
 */
export function faceDate(
  card: { status: string; due_date: string | null; completed_at: string | null },
  overdue: boolean,
): FaceDate | null {
  if (card.status === "done") {
    return card.completed_at ? { text: `Done ${shortDate(businessDate(card.completed_at))}`, kind: "done" } : null;
  }
  if (card.status === "not_doing") return { text: "Not doing", kind: "not-doing" };
  if (!card.due_date) return null;
  return overdue
    ? { text: `Overdue · ${shortDate(card.due_date)}`, kind: "overdue" }
    : { text: chipDate(card.due_date), kind: "due" };
}

/** "PR #1781 merged" once the state is known (W.161), "PR #1781" until then. */
export function facePrLabel(url: string, state: CardPrState | null): string {
  return state ? `${prPillLabel(url)} ${state}` : prPillLabel(url);
}

/** "2 blockers", "1 blocker": the blocked chip's words. */
export function blockedLabel(open: number): string {
  return `${open} blocker${open === 1 ? "" : "s"}`;
}
