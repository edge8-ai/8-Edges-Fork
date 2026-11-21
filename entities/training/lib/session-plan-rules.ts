// The pure side of a session plan (English Program PR 3), free of any server
// import so the "use client" editor can share it: the block shape, the plan
// states, and the minutes split that says how close a plan is to the
// programme's presentation-to-reactive share.
import { z } from "zod";

export const PLAN_STATES = ["none", "drafted", "checked"] as const;
export type PlanState = (typeof PLAN_STATES)[number];
export const PLAN_STATE_LABEL: Record<PlanState, string> = { none: "Not drafted yet", drafted: "Draft · check it", checked: "Checked" };

export const BLOCK_SIDES = ["presentation", "reactive"] as const;
export type BlockSide = (typeof BLOCK_SIDES)[number];

/** One block as the editor and the drafter hand it in: an exercise or a free line, never both. */
export const BlockInput = z
  .object({
    side: z.enum(BLOCK_SIDES),
    exerciseId: z.string().uuid().nullable(),
    text: z.string().trim().max(500, "Keep a free block under 500 characters.").nullable(),
    minutes: z.number().int().min(1, "A block takes at least a minute.").max(24 * 60),
  })
  .refine((b) => (b.exerciseId !== null) !== (Boolean(b.text) && b.text !== null), { message: "A block is a library exercise or a free line, one of the two." });
export type BlockInputType = z.infer<typeof BlockInput>;

export const BlocksInput = z.object({ blocks: z.array(BlockInput).max(40, "At most forty blocks."), reasoning: z.string().trim().max(2000).nullable().optional() });

export const MaterialsInput = z.object({
  materials: z.array(z.object({ label: z.string().trim().min(1, "Give the link a label.").max(120), url: z.string().trim().url("Give a full link.").max(500) })).max(20),
});

/** A block as the page shows it: the input plus the exercise's title when it is one. */
export type SessionBlock = BlockInputType & { exerciseTitle: string | null };

/** How the minutes fall across the two sides, and the presentation share in percent. */
export function splitMinutes(blocks: readonly { side: BlockSide; minutes: number }[]): { presentation: number; reactive: number; total: number; presentationPercent: number } {
  const presentation = blocks.filter((b) => b.side === "presentation").reduce((n, b) => n + b.minutes, 0);
  const reactive = blocks.filter((b) => b.side === "reactive").reduce((n, b) => n + b.minutes, 0);
  const total = presentation + reactive;
  return { presentation, reactive, total, presentationPercent: total === 0 ? 0 : Math.round((presentation / total) * 100) };
}
