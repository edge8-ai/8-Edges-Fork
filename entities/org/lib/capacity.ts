import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { selectCompanies } from "@/kernel/identity/reads";
import type { CapacitySource } from "./capacity-schemas";
import type { ModelCommitment, ModelRole } from "./capacity-model";

// Reads for Operations -> Capacity (S.7). Every read is a must-read: a failed
// read of roles or commitments rendered as an empty table would say "nothing
// is committed" and answer the fit check with a confident, wrong "fits", which
// is the one answer this screen must never invent.

export type CapacityRole = ModelRole & { name: string; positionId: string | null };

export type CapacityCommitment = ModelCommitment & {
  id: string;
  companyId: string | null;
  /** Null for internal work, which is what a null company_id means. */
  companyName: string | null;
  source: CapacitySource;
  note: string | null;
};

export type PickerOption = { id: string; label: string };

export type CapacityData = {
  roles: CapacityRole[];
  commitments: CapacityCommitment[];
  positions: PickerOption[];
  companies: PickerOption[];
};

/**
 * Everything the capacity screen shows: the live roles, the live commitments
 * against them that have not ended before `fromMonday`, and the options the two
 * forms pick from. A commitment that ended before the current week can no
 * longer affect capacity, so it is not listed.
 */
export async function loadCapacity(fromMonday: string): Promise<CapacityData> {
  const [rolesRes, commitmentsRes, positionsRes, companiesRes] = await Promise.all([
    companyOs
      .from("capacity_roles")
      .select("id, name, position_id, hours_per_week, effective_from")
      .is("archived_at", null)
      .order("name", { ascending: true }),
    companyOs
      .from("capacity_commitments")
      .select(
        "id, role_id, company_id, hours_per_week, starts_on, ends_on, source, note, " +
          "company:companies!capacity_commitments_company_id_fkey(name)",
      )
      .is("archived_at", null)
      .or(`ends_on.is.null,ends_on.gte.${fromMonday}`)
      .order("starts_on", { ascending: true }),
    companyOs.from("positions").select("id, title").eq("active", true).order("title", { ascending: true }),
    selectCompanies("id, name").is("archived_at", null).order("name", { ascending: true }),
  ]);

  const roles = mustRows(rolesRes, "[org/capacity] capacity_roles").map((r) => ({
    id: r.id,
    name: r.name,
    positionId: r.position_id,
    // numeric arrives as a JSON number from PostgREST today; Number() keeps the
    // model's arithmetic right if a driver ever hands it back as a string.
    hoursPerWeek: Number(r.hours_per_week),
    effectiveFrom: r.effective_from,
  }));
  const liveRoles = new Set(roles.map((r) => r.id));

  type CommitmentRow = {
    id: string;
    role_id: string;
    company_id: string | null;
    hours_per_week: number;
    starts_on: string;
    ends_on: string | null;
    source: string;
    note: string | null;
    company: { name: string } | null;
  };
  const commitmentRows = mustRows(commitmentsRes, "[org/capacity] capacity_commitments") as unknown as CommitmentRow[];
  const commitments = commitmentRows
    // An archived role's commitments stay in the table (archiving is reversible)
    // but leave the screen with it.
    .filter((c) => liveRoles.has(c.role_id))
    .map((c) => ({
      id: c.id,
      roleId: c.role_id,
      companyId: c.company_id,
      companyName: c.company?.name ?? null,
      hoursPerWeek: Number(c.hours_per_week),
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      source: c.source as CapacitySource,
      note: c.note,
    }));

  const positions = mustRows(positionsRes, "[org/capacity] positions").map((p) => ({ id: p.id, label: p.title }));
  const companies = (mustRows(companiesRes, "[org/capacity] companies") as { id: string; name: string }[]).map((c) => ({
    id: c.id,
    label: c.name,
  }));

  return { roles, commitments, positions, companies };
}
