"use server";

import { revalidateSurfaces } from "@/kernel/shell/surface";
import type { Result } from "@/kernel/data/result";
import { boardActorFor } from "./access";
import { DENIED } from "./card-helpers";
import { fileMeetingItemsOn } from "./meeting-cards";

// The meeting page's board picker (Z.13): when a client has several boards
// and the meeting names no AI Program, the filer leaves its actions waiting,
// and a person picks the board. The crm panel cannot import this (crm does not
// require boards); the meeting route, which may import any door, hands it to
// the panel as a prop. Guarded by the board the cards land on: only someone
// who acts on that board files cards onto it.
export async function fileMeetingActionsOnBoard(meetingId: string, boardId: string): Promise<Result> {
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const res = await fileMeetingItemsOn(meetingId, boardId);
  revalidateSurfaces(`/revenue/meetings/${meetingId}`);
  return res.ok ? { ok: true } : res;
}
