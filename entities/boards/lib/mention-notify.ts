import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { sendLarkDm } from "@/kernel/messaging/lark-api";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { recipientMayOpen } from "@/kernel/identity/may-open";
import { cardSlug } from "@/kernel/config/slug";

// A Lark DM to each person an @mention tagged (W.143), the same way an
// assignment tells its assignee (notify.ts, notifyBoardAssignee): by email,
// with a link that opens the card itself. Best-effort — a comment is saved
// whether or not a message goes out, and a failure here is logged, never
// returned. Server-only (getSiteOrigin uses next/headers): import only from
// server code, never from a client-reachable module.
//
// A mention is never a side door (AC.15, ADR 0013): the DM links to the board,
// so it goes only to a tagged person who may open that board's page. Each one's
// access is resolved on its own, because they are different people.
//
// HOUSE RULE: only the person tagged is told. Nobody else on the card, the
// board or the thread hears about a mention, because tagging someone is a
// request to THEM and not an announcement.

export type MentionTarget = { id: string; email: string | null };

// Enough of the comment to know whether to open it now; the card holds the rest.
const EXCERPT = 280;

export async function notifyMentioned(input: {
  boardId: string;
  cardId: string;
  cardTitle: string;
  byLabel: string;
  body: string;
  // Already filtered to the people this comment newly tagged, author excluded
  // (comment-threads.ts, mentionRecipients).
  targets: MentionTarget[];
}): Promise<void> {
  const targets = input.targets.filter((t) => t.email);
  if (targets.length === 0) return;
  try {
    // The fallback is null: without the board's slug there is no link to send,
    // and a DM that names a card nobody can open is worse than none.
    const board = readOr(
      await companyOs.from("boards").select("slug, name").eq("id", input.boardId).maybeSingle(),
      "[boards] mention notify board",
      null,
    ) as { slug: string; name: string } | null;
    if (!board?.slug) return;
    const path = `/team/boards/${board.slug}`;
    const url = `${await getSiteOrigin()}${path}?card=${cardSlug(input.cardTitle, input.cardId)}`;
    const body = input.body.length > EXCERPT ? `${input.body.slice(0, EXCERPT).trimEnd()}…` : input.body;
    const text = `${input.byLabel} mentioned you on "${input.cardTitle}" on the ${board.name} board.\n\n${body}\n${url}`;
    await Promise.all(
      targets.map(async (t) => {
        if (!(await recipientMayOpen(t.id))(path)) return;
        await sendLarkDm(t.email, text, { category: "workboard" });
      }),
    );
  } catch (err) {
    console.error("[boards] mention notify failed", err);
  }
}
