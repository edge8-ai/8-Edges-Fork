// The shapes several catalogue files share (split from catalogue.ts for the
// file-size cap, TH.8.3), so a publisher in one and a subscriber reading
// another agree on what a date, an amount and an addressee are.
import { z } from "zod";

// A calendar date, the way every date-only column in this tree stores one. It
// is spelled out rather than left as `z.string()` because a subscriber does
// arithmetic on these: a value like "next Friday" would satisfy the type,
// survive the publisher, and then quietly compare as a string against real
// dates inside somebody else's entity.
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a calendar date (YYYY-MM-DD)");

// Money, everywhere in this tree, is an integer number of cents. A float here
// would reach a subscriber that stores it and be wrong for as long as the row
// lives, so the publisher is refused instead.
export const cents = z.number().int("must be a whole number of cents").nonnegative();

// What the inbox (S.3) needs to say who a fact matters to and what it was
// about. The notifications entity requires nothing, so it cannot ask boards or
// crm afterwards; the publisher, which has these to hand, states them. They are
// optional, so a publisher that cannot say them still publishes, and no other
// subscriber depends on them. `actorPersonId` lets a subscriber leave out the
// person who caused the fact: nobody needs telling what they just did.
export const addressedTo = {
  title: z.string().min(1).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  actorPersonId: z.string().min(1).nullable().optional(),
};
