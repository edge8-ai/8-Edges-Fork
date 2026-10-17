import type { ReactNode } from "react";
import type { CardPeekSlot } from "@/kernel/shell/page-slots";
import { cardPeekFor } from "@/entities/boards/lib/card-peek";
import { moveCardColumn } from "@/entities/boards/lib/move-card";
import { CardPeekClosed, CardPeekDrawer } from "./CardPeekDrawer";

// What boards provides for the CardPeek slot (TH.2.6): a page that does not
// require boards, the Inbox above all, opens a card's own drawer in place. The
// composition root hands this to the page (app/shell.ts); a deployment without
// boards hands it nothing.
export async function CardPeek({ taskId, viewer, section, closeHref }: Parameters<NonNullable<CardPeekSlot>>[0]): Promise<ReactNode> {
  const peek = await cardPeekFor(taskId, viewer);
  if (peek.kind === "closed") {
    return <CardPeekClosed boardHref={peek.boardSlug ? `${section}/boards/${peek.boardSlug}` : null} closeHref={closeHref} />;
  }
  return <CardPeekDrawer data={peek.detail} cardId={peek.cardId} section={section} closeHref={closeHref} viewerPersonId={viewer.personId} onMove={moveCardColumn} />;
}
