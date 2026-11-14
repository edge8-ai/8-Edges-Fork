// What hiring tells the access resolver (ADR 0013): who is a Hiring manager.
// The kernel may not read requisitions, so this entity registers the fact
// through the composition root (app/access.ts). It moved here from team's
// access contributions with A.88.3, beside isHiringManager, which reads only
// hiring's requisitions; the rule is the one the /team/hiring board and the
// team sidebar follow, so the role and the board always agree.
import type { AccessContributions } from "@/kernel/identity/access-contributions";
import { isHiringManager } from "./team-hiring";

export const accessContributions: AccessContributions = {
  impliers: [
    {
      role: "hiring-manager",
      // isHiringManager counts admins too, as the hiring board does today.
      because: "is the hiring manager on a requisition, or an admin",
      holds: (s) => isHiringManager({ isAdmin: s.isAdmin, personId: s.personId }),
    },
  ],
};
