// The two shapes the Company Goals view is built from. They describe org's own
// rows — a quarter's objective with its key results, and the person a goal
// ladders up from — so they live here even though the roll-up that produces
// them lives in team (entities/team/lib/company-goals.ts): team owns `goals`,
// and an org that read that table directly would close a cycle (RS-09).
import type { KrRow, ObjectiveRow } from "./edges-shared";

export type ObjectiveWithKrs = ObjectiveRow & { krs: KrRow[] };

export type LadderedPerson = {
  teamMemberId: string;
  name: string;
  avatarUrl: string | null;
  departmentId: string | null;
};
