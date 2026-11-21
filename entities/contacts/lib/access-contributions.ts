// What contacts tells the access resolver (ADR 0013): who is on a client's team,
// and which companies a person's `clients` scope reaches. Both are read from
// staff_assignments (this entity's table) the way the team sidebar and the team
// client hub read them, so the role and the reach match what each page shows.
// They moved here from team's access contributions with A.88.2: team is a
// surface entity and may not reach this door from its lib/ (ADR 0025).
import type { AccessContributions } from "@/kernel/identity/access-contributions";
import { getActorClientCompanies, hasClientAssignments } from "./client-assignments";

export const accessContributions: AccessContributions = {
  impliers: [
    {
      role: "client-team",
      // The fact the team sidebar's Clients row followed (AC.8): an active staff assignment.
      because: "is assigned to at least one client",
      holds: (s) => (s.teamMemberId === null ? Promise.resolve(false) : hasClientAssignments({ teamMemberId: s.teamMemberId })),
    },
  ],
  reach: [
    {
      scope: "clients",
      ids: async (s) =>
        s.teamMemberId === null ? [] : (await getActorClientCompanies({ teamMemberId: s.teamMemberId })).map((c) => c.id),
    },
  ],
};
