import { z } from "zod";

// The inputs of the "Email the members" actions (CR.5.4), parsed right after
// each action's guard. The overview sends the plan it showed with every
// change, so the command can refuse one made over a plan changed elsewhere.

const cycleId = z.string().uuid("That cycle was not found. Reload the page.");

const Expected = z.object({
  mode: z.enum(["now", "scheduled", "manual"]).nullable(),
  scheduledAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "Reload the page.")
    .nullable(),
});

const Pick = z.discriminatedUnion("how", [
  z.object({ how: z.literal("now") }),
  z.object({
    how: z.literal("scheduled"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time, or leave it blank.").nullable(),
  }),
  z.object({ how: z.literal("manual") }),
]);

export const MemberEmailPlanInput = z.object({ cycleId, expected: Expected, pick: Pick });
export type MemberEmailPlanInput = z.infer<typeof MemberEmailPlanInput>;

export const MemberEmailClearInput = z.object({ cycleId, expected: Expected });
export type MemberEmailClearInput = z.infer<typeof MemberEmailClearInput>;

export const MemberEmailMarkInput = z.object({ cycleId });
export type MemberEmailMarkInput = z.infer<typeof MemberEmailMarkInput>;
