// What Training tells the access resolver (ADR 0013): who is a Host. The kernel
// may not read trainings, so this entity registers the fact through the
// composition root (app/access.ts), the way coaching registers the Coach.
//
// A Host is whoever organises a taught session (QS.5b; the quests spec, "Raids
// and Training": accepting as Host grants the right to organise that one
// session). The role holds training.host, which opens the organiser's session
// page and its register, move and cancel; each of those still finds only a
// session the reader organises, so the role widens nothing past their own.
import type { AccessContributions } from "@/kernel/identity/access-contributions";
import { hostsATaughtSession } from "./taught-sessions";

export const accessContributions: AccessContributions = {
  impliers: [
    {
      role: "host",
      because: "hosts a taught session",
      // Someone with no team member record (a portal client) hosts nothing on
      // the Team view, as the Coach and Client team facts read it.
      holds: async (s) => s.teamMemberId !== null && (await hostsATaughtSession(s.personId)),
    },
  ],
};
