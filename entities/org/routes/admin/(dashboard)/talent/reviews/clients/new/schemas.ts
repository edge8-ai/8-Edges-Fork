import { z } from "zod";

// The open-cycle screen's input (CR.2.5), parsed right after the action's
// guard (the admin consistency playbook, "Where schemas live"). Who opens it
// is never part of the input: the action takes that from the sign-in.

const id = (message: string) => z.string().uuid(message);

export const OpenCycleFormInput = z
  .object({
    companyId: id("Choose a client."),
    frameworkId: id("Choose a framework."),
    name: z.string().trim().min(1, "Give the cycle a name.").max(120, "Keep the name under 120 characters."),
    skipManagerPersonId: id("Choose the skip-manager, or no skip-manager.").nullable(),
    members: z
      .array(z.object({ teamMemberId: id("A member was not found. Reload the page."), clientManagerPersonId: id("Choose a client manager.").nullable() }))
      .min(1, "Tick at least one person to review.")
      .max(200, "A cycle holds at most 200 people."),
  })
  .refine((v) => new Set(v.members.map((m) => m.teamMemberId)).size === v.members.length, { message: "Someone is listed twice." });
export type OpenCycleFormInput = z.infer<typeof OpenCycleFormInput>;
