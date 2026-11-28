// A badge drop's two answers (LD.7b; the badges doc, section 5): Put in my
// display case, and Keep it in Achievements. Both mark the badge seen; the
// first also puts it at the end of the display case. Kept apart from the
// markup, and from the catalogue, so a "use client" tile loads only this, and
// the answers are tested without a DOM, the way the rank-up's are
// (rank-up-wiring.ts).
import type { Result } from "@/kernel/data/result";
import type { Rarity } from "../../lib/badges";
import { DISPLAY_CASE_HOLDS, type DisplayChange } from "../../lib/display-choices";
import type { Glyph } from "./glyphs";

/** One badge dropping: what its tile draws, and the unlock its answer marks seen. */
export type Drop = { unlockId: string; id: string; name: string; rarity: Rarity; glyph: Glyph; flavour: string };

/** The reader's own two commands a drop answers with, each guarded where it lives. */
export type DropActions = {
  setDisplay: (change: DisplayChange) => Promise<Result>;
  markShown: (unlockIds: string[]) => Promise<Result>;
};

/** Whether the display case has room for one more. */
export const caseHasRoom = (caseIds: readonly string[]): boolean => caseIds.length < DISPLAY_CASE_HOLDS;

/**
 * Put in my display case: the badge joins the end of the case, then is marked
 * seen. A save that fails says so and marks nothing, so the drop stays and the
 * choice is not lost; a full case refuses before saving anything.
 */
export async function putInCase(badgeId: string, unlockId: string, caseIds: readonly string[], actions: DropActions): Promise<Result & { caseIds?: string[] }> {
  if (caseIds.includes(badgeId)) {
    const marked = await actions.markShown([unlockId]);
    return marked.ok ? { ok: true, caseIds: [...caseIds] } : marked;
  }
  if (!caseHasRoom(caseIds)) return { ok: false, error: "Your display case holds five. Take one out on the Achievements tab to make room." };
  const next = [...caseIds, badgeId];
  const saved = await actions.setDisplay({ displayCase: next });
  if (!saved.ok) return saved;
  // The badge is in the case; a failed mark only means the drop shows once more later.
  await actions.markShown([unlockId]);
  return { ok: true, caseIds: next };
}

/** Keep it in Achievements: the badges are marked seen and go nowhere else. */
export function keepInAchievements(unlockIds: string[], actions: DropActions): Promise<Result> {
  return actions.markShown(unlockIds);
}

/** Where the drops lead when several land at once, and where a quiet line's name links. */
export const ACHIEVEMENTS_HREF = "/team/profile?tab=achievements";
