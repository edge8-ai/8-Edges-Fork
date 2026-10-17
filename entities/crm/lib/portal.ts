import { companyOs } from "@/kernel/data/supabase";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { portalStatusesFor, type PortalStatus } from "@/entities/crm/lib/portal-status";

// Admin-side reads for client-portal membership (company_os.portal_members).
// Admin surfaces only — /portal itself reads through entities/portal/lib/data.ts.

export type PortalMembershipRow = {
  id: string;
  person_id: string;
  company_id: string | null;
  role: string;
  status: string;
  invited_at: string | null;
};

export async function getPortalMembershipsForCompany(
  companyId: string,
): Promise<Map<string, PortalMembershipRow>> {
  const { data, error: companyErr } = await companyOs
    .from("portal_members")
    .select("id, person_id, company_id, role, status, invited_at")
    .eq("company_id", companyId);
  if (companyErr) console.error("[company-os/crm] portal_members", companyErr);
  const byPerson = new Map<string, PortalMembershipRow>();
  for (const row of (data ?? []) as PortalMembershipRow[]) byPerson.set(row.person_id, row);
  return byPerson;
}

export async function getPortalMembershipsForPerson(
  personId: string,
): Promise<PortalMembershipRow[]> {
  const { data, error: personErr } = await companyOs
    .from("portal_members")
    .select("id, person_id, company_id, role, status, invited_at")
    .eq("person_id", personId);
  if (personErr) console.error("[company-os/crm] portal_members", personErr);
  return (data ?? []) as PortalMembershipRow[];
}

export type PortalAccessRow = {
  personId: string;
  name: string;
  role: string;
  invitedAt: string | null;
  // "invited" until the person first signs in, then "active".
  accessStatus: Exclude<PortalStatus, "none">;
};

// Who at a company can sign in to the client portal: active memberships only,
// each marked by whether the person has ever signed in. Feeds the Portal access
// card on the admin company page.
export async function getPortalAccessForCompany(companyId: string): Promise<PortalAccessRow[]> {
  const { data, error } = await companyOs
    .from("portal_members")
    .select(`role, invited_at, people:people!person_id(id, ${NAME_COLUMNS}, auth_user_id)`)
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("invited_at", { ascending: true });
  if (error) {
    console.error("[company-os/crm] portal access", error);
    return [];
  }
  type Person = NamedPerson & { id: string; email: string; auth_user_id: string | null };
  const rows = (data ?? []) as unknown as Array<{ role: string; invited_at: string | null; people: Embedded<Person> }>;
  const portalStatus = await portalStatusesFor(rows.map((r) => one(r.people)?.auth_user_id));
  return rows.flatMap((r) => {
    const p = one(r.people);
    if (!p) return [];
    return [{
      personId: p.id,
      name: personName(p),
      role: r.role,
      invitedAt: r.invited_at,
      accessStatus: portalStatus(p.auth_user_id) === "active" ? "active" : "invited",
    }];
  });
}
