"use server";

// The Lore's two moves on the Quests page (QS.4; spec "The Lore on the page"):
// share a learning from the one-line composer, and say Will try on someone
// else's. Both open with the page's own atom, quests.mine, then call the Ideas
// door's commands, because a learning is Spark's row and Ideas writes it
// (ADR 0018). No points are written here: the ladders hear of a new spark
// through Ideas' own idea.posted fact (LD.2).
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { postLearning, sayWillTry } from "@/entities/ideas";
import { LearningLine, WillTryInput, parseError } from "./quest-rules";

/** Where a learning shows: the Quests page, Spark's field, and Home's Spark card. */
function revalidateLore(ideaId?: string): void {
  revalidatePath("/team/quests");
  revalidatePath("/team/ideas");
  if (ideaId) revalidatePath(`/team/ideas/${ideaId}`);
  revalidatePath("/team");
}

/** Shares one line as the reader's learning spark, as if posted in Spark's own composer. */
export async function shareLearning(line: string): Promise<Result & { id?: string }> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = LearningLine.safeParse(line);
  if (!parsed.success) return parseError(parsed.error.issues);
  const posted = await postLearning(actor.personId, parsed.data);
  if (!posted.ok) return posted;
  revalidateLore();
  return { ok: true, id: posted.id };
}

/** Says, or takes back, that the reader will try someone else's learning. */
export async function willTry(ideaId: string, on: boolean): Promise<Result> {
  await requirePermission("quests.mine");
  const actor = await requireTeamMember();
  const parsed = WillTryInput.safeParse({ ideaId, on });
  if (!parsed.success) return parseError(parsed.error.issues);
  const r = await sayWillTry(actor.personId, parsed.data.ideaId, parsed.data.on);
  if (!r.ok) return r;
  revalidateLore(parsed.data.ideaId);
  return { ok: true };
}
