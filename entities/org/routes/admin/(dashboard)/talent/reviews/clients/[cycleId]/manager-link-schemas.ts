import { z } from "zod";
import { CycleInput } from "./schemas";

// The input of the owner's actions on a client manager's one link to a cycle
// (CR.5.6), parsed right after each action's guard. The ids come from the
// links card's own buttons, so a failure means a stale page or a hand-made
// request, and the words say what to do in either case.

export const ManagerLinkInput = CycleInput.extend({ clientManagerPersonId: z.string().uuid("That client manager was not found. Reload the page.") });
export type ManagerLinkInput = z.infer<typeof ManagerLinkInput>;
