import { companyOs } from "@/kernel/data/supabase";
import { one, type Embedded } from "@/kernel/config/embedded";
import { saigonToday } from "@/kernel/config/dates";
import { currentClientOrFilters } from "@/kernel/identity/client-status";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Reads for the admin "Assume" feature (view the client portal as a specific
// client company). Admin surfaces only.

export type AssumableMember = {
  personId: string;
  name: string;
  role: string;
};

export type AssumableClient = {
  companyId: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  // Active portal members, so an admin can view as a specific person with that
  // person's real role. Empty for companies with no portal users yet — those
  // fall back to the legacy primary-contact persona (viewed as admin).
  members: AssumableMember[];
};

// Mirrors the admin Clients list (app/admin/(dashboard)/revenue/clients): the
// default set is current clients by client dates, archived excluded.
// `showInactive` drops that filter to reveal every non-archived company (leads,
// prospects, former clients) so you can assume any of them. "View as" still
// needs a linked contact; startAssumeSession enforces it.

export async function listAssumableClients(showInactive = false): Promise<AssumableClient[]> {
  let q = companyOs
    .from("companies")
    .select(`id, name, person_companies(is_primary, people(${NAME_COLUMNS}))`)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (!showInactive) {
    for (const group of currentClientOrFilters(saigonToday())) q = q.or(group);
  }
  const [{ data }, { data: memberData }] = await Promise.all([
    q,
    companyOs
      .from("portal_members")
      .select(`company_id, person_id, role, people!person_id(${NAME_COLUMNS})`)
      .eq("status", "active"),
  ]);

  type Row = {
    id: string;
    name: string | null;
    person_companies: { is_primary: boolean; people: Embedded<NamedPerson & { email: string }> }[] | null;
  };
  type MemberRow = {
    company_id: string;
    person_id: string;
    role: string;
    people: Embedded<NamedPerson & { email: string }>;
  };

  const membersByCompany = new Map<string, AssumableMember[]>();
  for (const m of (memberData ?? []) as MemberRow[]) {
    const person = one(m.people);
    const list = membersByCompany.get(m.company_id) ?? [];
    list.push({
      personId: m.person_id,
      name: personName(person, "Unknown member"),
      role: m.role,
    });
    membersByCompany.set(m.company_id, list);
  }

  return ((data ?? []) as Row[]).map((c) => {
    const links = c.person_companies ?? [];
    const best = links.find((l) => l.is_primary) ?? links[0] ?? null;
    const person = best ? one(best.people) : null;
    return {
      companyId: c.id,
      companyName: c.name || "—",
      contactName: personName(person, null),
      contactEmail: person?.email ?? null,
      members: (membersByCompany.get(c.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}
