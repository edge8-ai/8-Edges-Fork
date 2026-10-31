// Who may be called on a quest (QS.1; spec 2026-10-20, "Data"): staff only,
// the people who hold a current team_members row, never people at large. The
// PR #2120 lesson is that a picker reading every person offers CRM contacts
// beside the staff, so this asks the kernel's own question about the team
// (kernel/identity/team-people) and nothing else. The summon action checks
// every called id against the same list, so the picker and the write agree.
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { initials } from "@/kernel/ui/format";

/** One person as a quest draws them: their people.id, their name and a monogram. */
export type Portrait = { personId: string; name: string; initials: string };

/** Everyone on the team now, by first name, as portraits. A failed read raises. */
export async function listStaffPortraits(): Promise<Portrait[]> {
  return (await listCurrentTeamPeople()).map((p) => ({ personId: p.id, name: p.name, initials: initials(p.name) }));
}

/** The people.id of everyone on the team now, for checking who a summon calls. A failed read raises. */
export async function staffIds(): Promise<Set<string>> {
  return new Set((await listCurrentTeamPeople()).map((p) => p.id));
}
