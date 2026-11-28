import { z } from "zod";
import { cleanTokens } from "./tokens";
import { TASK_PRIORITIES } from "./types";

// Card templates per board (W.58).
//
// New card opens the same empty form every time, so the definition of done
// for a recurring KIND of work — a client onboarding, a content publish, a
// migration — lives in people's heads and is retyped or forgotten. A board
// keeps a small list of skeletons in `boards.metadata.card_templates` and
// "New card" offers them.
//
// NO MIGRATION: boards.metadata is already jsonb. That column has no
// constraint, which is exactly the case where a schema literal needs runtime
// proof (AR-02), so the shape is a Zod schema and it is applied in BOTH
// directions:
//
//   · WRITING, at the action boundary, so nothing malformed is stored by us;
//   · READING, per entry, so a row that got there another way — a hand-edited
//     jsonb, an older shape, a half-written list — cannot crash the drawer.
//     A bad entry is DROPPED rather than rendered half-built, and the good
//     ones beside it still work.

export const cardTemplate = z.object({
  name: z.string().trim().min(1, "Name the template.").max(60),
  description: z.string().trim().max(4000).optional(),
  epicId: z.string().trim().min(1).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  humanTokens: z.number().nonnegative().optional(),
});

export type CardTemplate = z.infer<typeof cardTemplate>;

// A board's whole list. Capped so a runaway write cannot make every board
// page carry a megabyte of jsonb; the number is a sanity bound, not a design
// statement about how many kinds of work a board has.
export const MAX_TEMPLATES = 20;
export const cardTemplateList = z.array(cardTemplate).max(MAX_TEMPLATES);

/**
 * The templates a board actually has, read defensively.
 *
 * Anything that is not an array reads as none; inside an array, each entry is
 * parsed on its own and a failing one is skipped. So the worst a malformed
 * jsonb can do is offer fewer templates than somebody expected — never throw
 * on a board page, and never fill a new card with a value that is not a
 * priority or not a number.
 */
export function readCardTemplates(metadata: Record<string, unknown> | null | undefined): CardTemplate[] {
  const raw = metadata?.["card_templates"];
  if (!Array.isArray(raw)) return [];
  const out: CardTemplate[] = [];
  for (const entry of raw.slice(0, MAX_TEMPLATES)) {
    const parsed = cardTemplate.safeParse(entry);
    if (!parsed.success) continue;
    // Human Tokens live on a 0.05 grid everywhere else; a stored figure off
    // the grid is snapped rather than refused, the same way a typed one is.
    const humanTokens = parsed.data.humanTokens === undefined ? undefined : cleanTokens(parsed.data.humanTokens) ?? undefined;
    out.push({ ...parsed.data, humanTokens });
  }
  return out;
}
