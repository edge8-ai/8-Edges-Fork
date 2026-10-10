// The people the team Home draws (TH.1.2, TH.1.6): everyone who works here
// today, for "Meet someone", and the newest of them, for "New faces".
//
// Its own reader rather than a wider getDirectory, whose fixed column list is a
// reviewed boundary. This one adds a single field the directory leaves out, the
// start date, and only to say "with Edge8 since Jun 2025" or to mark a new
// joiner. It reads no contact details, no leave and no employment terms.
//
// Company-visible, like the directory, so it takes no actor. The order is the
// caller's to choose: Home shuffles it on every visit, so nobody is ever first
// by rank, tenure or alphabet.
import { companyOs } from "@/kernel/data/supabase";
import { readOr } from "@/kernel/data/read";
import { ON_CHART_STATUSES } from "@/entities/org";
import { one } from "@/kernel/config/embedded";
import { GREETING_COLUMNS, greetingName, personName, type GreetedPerson } from "@/kernel/config/people-name";

export type HomePerson = {
  id: string;
  personId: string;
  name: string;
  firstName: string;
  avatarUrl: string | null;
  role: string | null;
  team: string | null;
  location: string | null;
  startDate: string | null;
};

type Person = GreetedPerson & { avatar_url: string | null };
type Row = {
  id: string;
  person_id: string;
  start_date: string | null;
  work_location: string | null;
  people: Person | Person[] | null;
  departments: { name: string | null } | { name: string | null }[] | null;
  positions: { title: string | null } | { title: string | null }[] | null;
};

/** How long a joiner counts as new on Home. */
export const NEW_FACE_DAYS = 45;

/** Whether someone who started on `startDate` is still a new face on `today`. */
export function isNewFace(startDate: string | null, today: string): boolean {
  if (!startDate || startDate > today) return false;
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
  return days <= NEW_FACE_DAYS;
}

/** Everyone on the chart today. Null when the read fails, so Home hides the strip. */
export async function homePeople(): Promise<HomePerson[] | null> {
  const res = await companyOs
    .from("team_members")
    .select(
      "id, person_id, start_date, work_location, " +
        `people:people!person_id(${GREETING_COLUMNS}, avatar_url), ` +
        "departments:departments!department_id(name), " +
        "positions:positions!position_id(title)",
    )
    .in("status", [...ON_CHART_STATUSES]);
  const rows = readOr(res, "Home people", null) as unknown as Row[] | null;
  if (rows === null) return null;
  return rows.flatMap((r) => {
    const person = one(r.people);
    // The name to show, and the name to address them by ("Say hi to Lan Anh!"):
    // the kernel's two verbs, never an email (S.14).
    const name = personName(person ? { ...person, email: null } : null, null);
    if (!name) return [];
    return [{
      id: r.id,
      personId: r.person_id,
      name,
      firstName: greetingName(person, null) ?? name,
      avatarUrl: person?.avatar_url ?? null,
      role: one(r.positions)?.title ?? null,
      team: one(r.departments)?.name ?? null,
      location: r.work_location,
      startDate: r.start_date,
    }];
  });
}
