import { companyOs } from "@/kernel/data/supabase";
import { recordAudit } from "@/kernel/audit/audit";
import type { Result } from "@/kernel/data/result";
import type { BoardActor } from "./access";
import { ensureMember, refresh } from "./card-helpers";
import { commentInput, firstIssue, type CommentInput } from "./schemas";
import { mentionRecipients, replyParentProblem, type ThreadRow } from "./comment-threads";
import { notifyMentioned } from "./mention-notify";

// The body of addComment (actions.ts), which keeps only its guard: the guard
// has to be the action's first statement, and everything a comment now does —
// a reply's parent check, the mentions, the notification — would otherwise grow
// a file that holds every other card action too. Not a server action itself:
// it trusts that its caller has already resolved `actor` for this card's board.

/** The card being commented on, as the guard read it. */
export type CommentCard = { id: string; board_id: string; title: string };

export async function saveComment(actor: BoardActor, card: CommentCard, raw: CommentInput, boardSlug: string): Promise<Result> {
  const parsed = commentInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error.issues) };
  const { body, parentCommentId, mentions } = parsed.data;

  if (parentCommentId) {
    const { data: parent, error } = await companyOs
      .from("task_comments")
      .select("task_id, parent_comment_id")
      .eq("id", parentCommentId)
      .maybeSingle();
    // A failed read is not a missing parent: say which, so nobody retypes a
    // reply to a thread that is still there.
    if (error) return { ok: false, error: `Could not load the comment you are replying to: ${error.message}` };
    const problem = replyParentProblem(parent as ThreadRow | null, card.id);
    if (problem) return { ok: false, error: problem };
  }

  // Only a team member can be tagged: the picker offers nobody else, and the
  // tag sends a DM, so an id from anywhere else is dropped rather than
  // messaged. The same read gives the addresses the notification needs.
  let tagged: { id: string; email: string | null }[] = [];
  if (mentions.length > 0) {
    const { data, error } = await companyOs.from("people").select("id, email, is_team_member").in("id", mentions);
    // Refused, not saved without the mentions: the author tagged someone on
    // purpose, and a comment that silently told nobody would look as if it had.
    if (error) return { ok: false, error: `Could not check who was mentioned: ${error.message}` };
    const staff = new Map(
      ((data ?? []) as { id: string; email: string | null; is_team_member: boolean | null }[])
        .filter((p) => p.is_team_member)
        .map((p) => [p.id, p.email]),
    );
    tagged = [...new Set(mentions)].filter((id) => staff.has(id)).map((id) => ({ id, email: staff.get(id) ?? null }));
  }

  const row = {
    task_id: card.id,
    author_person_id: actor.personId,
    author_label: actor.label,
    body,
    parent_comment_id: parentCommentId ?? null,
    mentions: tagged.map((t) => t.id),
  };
  const { data: saved, error } = await companyOs.from("task_comments").insert(row).select("id").single();
  if (error) return { ok: false, error: error.message };
  const commentId = (saved as { id: string } | null)?.id ?? null;
  await recordAudit({ table: "task_comments", recordId: commentId, operation: "insert", actor: actor.label, newData: row });

  // A mention brings the person into the board the way an assignment does
  // (W.143): the message below links to this card, and without membership the
  // board would not open for them. The comment has persisted either way, so a
  // failure here is reported after the messages go, never instead of them.
  let memberErr: string | null = null;
  for (const t of tagged) {
    if (t.id !== actor.personId) memberErr = (await ensureMember(card.board_id, t.id)) ?? memberErr;
  }

  const recipients = new Set(mentionRecipients(row.mentions, actor.personId));
  await notifyMentioned({
    boardId: card.board_id,
    cardId: card.id,
    cardTitle: card.title,
    byLabel: actor.label,
    body,
    targets: tagged.filter((t) => recipients.has(t.id)),
  });
  refresh(boardSlug);
  if (memberErr) return { ok: false, error: `Comment posted, but someone you mentioned could not be added to the board, so it may not open for them: ${memberErr}` };
  return { ok: true };
}
