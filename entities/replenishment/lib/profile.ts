import { z } from "zod";

// A replenishment profile: one warehouse's rules, held as data so that no
// client's thresholds, BIN names or brands are ever written into code
// (spec 2026-10-28, "The engine: one pure module"). This module imports only
// Zod, so a port into another codebase can copy it as it is.

function compiles(source: string): boolean {
  try {
    new RegExp(source);
    return true;
  } catch {
    return false;
  }
}

/** A pattern a manager typed. A typo must be refused, never allowed to empty the report quietly. */
const pattern = z.string().min(1).refine(compiles, "is not a valid pattern");

const names = (source: string, group: string) => source.includes(`(?<${group}>`);

/** A text test on an item. `label` is what a person reads when an item is left out because of it. */
const testSchema = z
  .object({
    field: z.enum(["description", "item"]).optional(),
    contains: z.string().min(1).optional(),
    regex: pattern.optional(),
    label: z.string().min(1),
  })
  .refine((t) => t.contains !== undefined || t.regex !== undefined, "needs a word to contain or a pattern to match");

/** A family of BINs. The named groups of `pattern`, read as numbers in `walk` order, are the walking order. */
const zoneSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    role: z.enum(["pick", "reserve"]),
    pattern,
    walk: z.array(z.string().min(1)).min(1),
    /** Zones of one role are walked in rank order: every rank-0 location before any rank-1 one. */
    rank: z.number().int().min(0),
  })
  .superRefine((zone, ctx) => {
    const missing = zone.walk.filter((group) => !names(zone.pattern, group));
    if (missing.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["walk"], message: `walks by ${missing.join(", ")}, which the pattern does not name` });
    }
  });

const moveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), qty: z.number().positive() }),
  /** A decision only visible at the shelf, such as a box size: each option is shown, capped at reserve. */
  z.object({ kind: z.literal("choice"), options: z.array(z.number().positive()).min(2) }),
]);

const bandSchema = z.object({
  label: z.string().min(1),
  min: z.number().optional(),
  max: z.number().optional(),
  /** Restock when the pick total is below this. It decides whether, never how much. */
  reorderBelow: z.number().positive(),
  move: moveSchema,
});

const itemRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enabled: z.boolean(),
  /** The rule applies when every one of these matches. The first rule that applies wins. */
  when: z.array(testSchema).min(1),
  /** Once the rule applies, an item failing any of these is left out, never guessed. */
  require: z.array(testSchema).optional(),
  /** A pattern with a `size` group, read from the trimmed description. */
  size: pattern.refine((source) => names(source, "size"), "needs a group named size").optional(),
  bands: z.array(bandSchema).min(1),
});

const profileSchema = z.object({
  columns: z.object({
    item: z.string().min(1),
    description: z.string().min(1),
    location: z.string().min(1),
    qty: z.string().min(1),
  }),
  /** Flag the export as possibly cut off when it has this many data rows or fewer. */
  truncatedAtOrBelow: z.number().int().positive().nullable(),
  zones: z
    .array(zoneSchema)
    .refine((zones) => zones.some((zone) => zone.role === "pick") && zones.some((zone) => zone.role === "reserve"), "needs at least one pick zone and one reserve zone"),
  /** An item matching any of these is out of scope, whatever rule it would meet. */
  exclude: z.array(testSchema),
  rules: z.array(itemRuleSchema).min(1),
  destinations: z.object({ count: z.number().int().min(1).max(10), from: z.enum(["furthest", "nearest"]) }),
  /** The words the operator's screen shows, in the warehouse's own terms. */
  words: z.object({
    pick: z.string().min(1),
    reserve: z.string().min(1),
    instructions: z.array(z.string().min(1)),
    destinationRule: z.string().min(1),
    noPickNote: z.string().min(1),
    choiceHint: z.string().min(1),
    footer: z.string().min(1).nullable(),
  }),
});

export type Profile = z.infer<typeof profileSchema>;

/** One failing field: its path in the document ("rules.0.bands.1.move") and what is wrong with it. */
export type ProfileIssue = { path: string; message: string };

/**
 * A profile from a save, an import or a stored row. A refusal names every
 * failing field by its path ("rules.0.bands.1.move: …"), in one sentence for
 * a message and as a list, so the editor can put each one beside its field.
 */
export function parseProfile(input: unknown): { ok: true; profile: Profile } | { ok: false; error: string; issues: ProfileIssue[] } {
  const parsed = profileSchema.safeParse(input);
  if (parsed.success) return { ok: true, profile: parsed.data };
  const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "profile", message: issue.message }));
  return { ok: false, error: issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "), issues };
}
export type ItemRule = Profile["rules"][number];
export type Band = ItemRule["bands"][number];
export type Move = Band["move"];
export type ItemTest = Profile["exclude"][number];
