// The facts behind the ladders' climb (LD.2; spec 2026-10-21, "How positions
// are written"; ADR 0021), part of the one vocabulary in catalogue.ts and split
// out only for the file-size cap. Each states that a person did something that
// may earn them points. The publisher judges nothing; what an act is worth is
// the ladders' rule, and a deployment without ladders simply has no listener.
//
// Neither fact names a tier, a division or a point. A rank-up is a recorded
// moment and never a bus fact, because any entity may subscribe to the bus and
// a fact naming a person's new tier is the read the fence forbids.
import { z } from "zod";

export const ACT_EVENTS = {
  // A spark or a learning was posted on Spark. Ideas states it from the one
  // writer every new spark passes through (postSpark), whichever page posted
  // it. The ladders listen and recompute the author.
  "idea.posted": z.object({
    ideaId: z.string().min(1),
    /** The spark's author (company_os.people). */
    personId: z.string().min(1),
  }),

  // A word landed on a training register: a row's status was written by the
  // member, the organiser or a transcript's reading. Every write is stated,
  // attended or not, so a mark taken back corrects whatever the mark earned,
  // as a card taken out of Done does. A transcript reading, which may write
  // many rows of one session at once, is stated once for the session with no
  // row named (personId and status null). The ladders listen: when the session
  // is a Raid, its Host is recomputed (a Raid someone came to is a fire).
  "training.attendance.marked": z.object({
    trainingId: z.string().min(1),
    /** The person on the register row (company_os.people); null for a whole reading. */
    personId: z.string().min(1).nullable(),
    status: z.enum(["pending", "attended", "absent", "skipped"]).nullable(),
  }),
} as const;
