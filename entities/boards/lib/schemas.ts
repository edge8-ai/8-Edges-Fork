import { z } from "zod";
import { NEGATIVE_TOKENS } from "./tokens";

// Input schema for `createCard`. It is parsed right after the board guard, so
// the handler below it can trust the shape and only apply business defaults
// (priority fallback, token rounding). The title message matches the one the
// UI has always shown, so nothing user-facing changed when the hand-written
// check became a schema.
export const createCardInput = z.object({
  boardId: z.string().min(1),
  columnId: z.string().min(1),
  title: z.string().trim().min(1, "Give the card a title."),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  internal: z.boolean().optional(),
  humanTokens: z.number().min(0, NEGATIVE_TOKENS).nullable().optional(),
  // The PR row shows on a new card (W.159), so what is pasted there is kept
  // (bug hunt F10, 2026-10-05); stored by mergeCardMeta, as on a saved card.
  prUrl: z.string().optional(),
  // The spark this card was picked up from on /team/ideas (ID.2.8), kept in
  // metadata.idea_id: the idea page reads it back to say Picked up, and
  // Shipped once the card is done.
  ideaId: z.string().uuid().optional(),
});

export type CreateCardInput = z.infer<typeof createCardInput>;

// Input for a comment or a reply on a card (W.143), parsed right after the
// board guard in addComment. A mention is a person id, never a name parsed out
// of the text, so the notification and the highlight agree on who was meant.
// Twenty is a ceiling on one comment's DMs, well above any real conversation,
// so a pasted list cannot turn a comment into a broadcast.
export const MAX_MENTIONS = 20;
export const commentInput = z.object({
  body: z.string({ required_error: "Write a comment first." }).trim().min(1, "Write a comment first."),
  parentCommentId: z.string().uuid("That is not a comment on this card.").nullable().optional(),
  mentions: z
    .array(z.string().uuid("A mention must name a person."))
    .max(MAX_MENTIONS, `Mention at most ${MAX_MENTIONS} people in one comment.`)
    .default([]),
});

export type CommentInput = z.input<typeof commentInput>;

// Resolving or reopening a thread (W.143).
export const resolveThreadInput = z.object({
  commentId: z.string().uuid("That is not a comment on this card."),
  resolved: z.boolean(),
});

// The comment schemas' messages are whole sentences written for the person at
// the comment box, so the first one is shown as it is, without the field path
// zodIssuesToMessage puts in front (which suits a form with labelled fields).
export function firstIssue(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "That comment could not be read.";
}
