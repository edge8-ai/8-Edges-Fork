import { z } from "zod";

// The inputs of the owner's actions on one client review cycle (CR.2.3 and
// CR.2.4), parsed right after each action's guard (the admin consistency
// playbook, "Where schemas live"). The ids come from the overview's own
// buttons, so a failure means a stale page or a hand-made request, and the
// words say what to do in either case.

const id = (message: string) => z.string().uuid(message);
const RELOAD = "That review was not found. Reload the page.";

export const CycleInput = z.object({ cycleId: id("That cycle was not found. Reload the page.") });
export type CycleInput = z.infer<typeof CycleInput>;

export const MemberInput = CycleInput.extend({ teamMemberId: id(RELOAD) });
export type MemberInput = z.infer<typeof MemberInput>;

export const ReopenInput = MemberInput.extend({ kind: z.enum(["self", "client_manager"]) });
export type ReopenInput = z.infer<typeof ReopenInput>;

export const ChangeClientManagerInput = MemberInput.extend({ clientManagerPersonId: id("Choose a client manager.") });
export type ChangeClientManagerInput = z.infer<typeof ChangeClientManagerInput>;

export const AddMemberInput = CycleInput.extend({
  teamMemberId: id("Choose someone to add."),
  clientManagerPersonId: id("Choose one of the client's contacts.").nullable(),
});
export type AddMemberInput = z.infer<typeof AddMemberInput>;

export const LinkCopiedInput = z.object({ reviewId: id("That link was not found.") });
export type LinkCopiedInput = z.infer<typeof LinkCopiedInput>;

// CR.3.3: the owner's summary of one member's review. The command trims it
// and keeps it under its own cap; this only bounds what the page may send.
export const SummaryInput = MemberInput.extend({ summary: z.string().max(6000, "A summary can be at most 6000 characters.") });
export type SummaryInput = z.infer<typeof SummaryInput>;
