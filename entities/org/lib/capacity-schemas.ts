import { z } from "zod";

// What the capacity actions accept, parsed at the boundary (AR-02). Browser-safe:
// the screen's forms share the source vocabulary and the limits, so a form never
// offers a value the action would refuse.
//
// Every shape here is exactly what the forms produce, because a schema that
// refuses its own form's output passes every gate and fails the first person to
// press Save: <input type="date"> yields "YYYY-MM-DD", or "" once cleared; a
// select's "none" option yields "". Both empties are normalised to null.

/** What prompted a commitment; the column's check constraint holds the same list. */
export const CAPACITY_SOURCES = ["manual", "deal", "requisition", "work_request"] as const;
export type CapacitySource = (typeof CAPACITY_SOURCES)[number];

// numeric(6,2) holds up to 9999.99. A week has 168 hours, so a role (which may
// stand for several people doing the same job) is capped well above any real
// team rather than at the column's limit.
const MAX_WEEKLY_HOURS = 2000;

const zId = z.string().uuid("Not a valid id.");
const zOptionalId = z
  .string()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(zId.nullable());
const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD.");
const zOptionalDay = z
  .string()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(zDay.nullable());
const zHours = z
  .number({ invalid_type_error: "Give the hours per week as a number." })
  .finite("Give the hours per week as a number.")
  .max(MAX_WEEKLY_HOURS, `Keep it to ${MAX_WEEKLY_HOURS} hours a week or fewer.`)
  // Two decimals, the column's scale; more would be silently rounded by Postgres.
  .transform((n) => Math.round(n * 100) / 100);

export const capacityRoleSchema = z.object({
  name: z.string().trim().min(1, "Give the role a name.").max(120, "Keep the name to 120 characters."),
  positionId: zOptionalId,
  hoursPerWeek: zHours.pipe(z.number().min(0, "Hours per week can't be negative.")),
  effectiveFrom: zDay,
});
export type CapacityRoleInput = z.input<typeof capacityRoleSchema>;

export const capacityCommitmentSchema = z
  .object({
    roleId: zId,
    companyId: zOptionalId,
    hoursPerWeek: zHours.pipe(z.number().positive("Commit more than zero hours a week.")),
    startsOn: zDay,
    endsOn: zOptionalDay,
    source: z.enum(CAPACITY_SOURCES, { errorMap: () => ({ message: "Pick where the commitment came from." }) }),
    note: z
      .string()
      .max(2000, "Keep the note to 2000 characters.")
      .transform((v) => (v.trim() ? v.trim() : null)),
  })
  .refine((c) => c.endsOn === null || c.endsOn >= c.startsOn, {
    message: "The end date can't be before the start.",
    path: ["endsOn"],
  });
export type CapacityCommitmentInput = z.input<typeof capacityCommitmentSchema>;
