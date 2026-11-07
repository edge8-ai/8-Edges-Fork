"use server";

import { boardActorFor, DENIED } from "@/entities/boards";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import type { Result } from "@/kernel/data/result";
import { fileMeetingItemsOn } from "./cards";

// The meeting page's board picker (Z.13): when a client has several boards
// and the meeting names no AI Program, the filer leaves its actions waiting,
// and a person picks the board. Guarded by the board the cards land on: only
// someone who acts on that board files cards onto it.
export async function fileMeetingActionsOnBoard(meetingId: string, boardId: string): Promise<Result> {
  const actor = await boardActorFor(boardId);
  if (!actor) return { ok: false, error: DENIED };
  const res = await fileMeetingItemsOn(meetingId, boardId, actor);
  revalidateSurfaces(`/revenue/meetings/${meetingId}`);
  return res.ok ? { ok: true } : res;
}
