import { companyOs } from "@/kernel/data/supabase";
import { sendLarkDm } from "@/kernel/messaging/lark-api";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { recipientMayOpen } from "@/kernel/identity/may-open";

// Lark DM the assignee when a card is assigned to them (best-effort; no-ops until
// the Lark app is configured). Never notifies self-assignment, and never sends
// a link to a board the assignee may not open (AC.15, ADR 0013): the DM exists
// to point at that board, so without a page they can open there is nothing to
// send. Server-only
// (getSiteOrigin uses next/headers): import only from "use server" files, never
// from a client-reachable module.
export async function notifyBoardAssignee(
  boardId: string,
  assigneeId: string | null,
  cardTitle: string,
  byPersonId: string | null,
  // The one line of context the person handing the card over wrote (W.60).
  // Optional, because the line is an invitation and not a required field: an
  // empty handover sends exactly the message it always did.
  handoverNote?: string | null,
): Promise<void> {
  if (!assigneeId || assigneeId === byPersonId) return;
  try {
    const [{ data: board }, { data: person }] = await Promise.all([
      companyOs.from("boards").select("slug, name").eq("id", boardId).maybeSingle(),
      companyOs.from("people").select("email").eq("id", assigneeId).maybeSingle(),
    ]);
    const email = (person as { email: string } | null)?.email;
    const slug = (board as { slug: string } | null)?.slug;
    const name = (board as { name: string } | null)?.name ?? "a board";
    if (!email || !slug) return;
    const path = `/team/boards/${slug}`;
    if (!(await recipientMayOpen(assigneeId))(path)) return;
    const url = `${await getSiteOrigin()}${path}`;
    // The note goes between the fact and the link, because the fact is what
    // the message is and the note is why it matters to the reader. Without one
    // the DM is byte-for-byte what it has always been.
    const note = handoverNote?.trim();
    const context = note ? `\n\n${note}` : "";
    await sendLarkDm(email, `You were assigned "${cardTitle}" on the ${name} board.${context}\n${url}`, { category: "workboard" });
  } catch (err) {
    console.error("[boards] assignee notify failed", err);
  }
}
