"use server";

// markShown (LD.5; spec "The door", "The rank-up"; ADR 0021): the reader has
// seen a rank-up, so its unlocks stop waiting. It opens with ladders.mine and
// writes the reader's own unlocks and nobody else's: the rows are pinned to
// the signed-in person by the query itself, so an id that names someone else's
// unlock, or an extra argument naming anyone, changes nothing. It takes a list
// because one act can cross several tiers and the screen shows the highest
// with the ones beneath it seen too (spec "The rank-up"). The badge drops
// (LD.7b) mark their unlocks shown through the same command.
import { z } from "zod";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import type { Result } from "@/kernel/data/result";
import { updateLadderUnlocks } from "./writes";

const UnlockIds = z.array(z.string().uuid()).min(1).max(20);

/**
 * Marks the reader's own waiting unlocks in `unlockIds` shown. Only rows of
 * theirs that are still waiting are written, so a second call, or an id that
 * is not theirs, writes nothing; both answer ok, because saying which ids exist
 * for someone else would itself be a read about them.
 *
 * It revalidates nothing on purpose. The rank-up has already closed on the
 * reader's screen, and the other unlocks still waiting show on a later render
 * of the team shell, one at a time, rather than one straight after another.
 */
export async function markShown(unlockIds: string[]): Promise<Result> {
  await requirePermission("ladders.mine");
  const actor = await requireTeamMember();
  const parsed = UnlockIds.safeParse(unlockIds);
  if (!parsed.success) return { ok: false, error: "That is not an unlock of yours." };
  const { error } = await updateLadderUnlocks({ shown_at: new Date().toISOString() })
    .in("id", parsed.data)
    .eq("person_id", actor.personId)
    .is("shown_at", null);
  if (error) return { ok: false, error: "It could not be saved as seen. It will show again next time." };
  return { ok: true };
}
