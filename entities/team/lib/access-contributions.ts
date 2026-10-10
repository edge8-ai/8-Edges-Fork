// What the team hub tells the access resolver (ADR 0013): who is a Hiring
// manager, who is on a client's team, and which companies a person's `clients`
// scope reaches. Both facts
// are read the way the team sidebar reads them today, so the role and the reach
// match what each page already shows.
import type { AccessContributions } from "@/kernel/identity/access-contributions";
import { isHiringManager } from "./hiring";
import { getActorClientCompanies, hasClientAssignments } from "./hub-clients";

export const accessContributions: AccessContributions = {
  impliers: [
    {
      role: "hiring-manager",
      // isHiringManager counts admins too, as the hiring board does today.
      because: "is the hiring manager on a requisition, or an admin",
      holds: (s) => isHiringManager({ isAdmin: s.isAdmin, personId: s.personId }),
    },
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
