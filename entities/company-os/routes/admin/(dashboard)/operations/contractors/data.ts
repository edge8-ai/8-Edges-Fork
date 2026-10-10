import { companyOs } from "@/kernel/data/supabase";
import { selectCompensationSensitive } from "@/entities/finance";
import { personName, type NamedPerson } from "@/kernel/config/people-name";
import { num } from "@/entities/company-os/lib/contractors";
import type { ContractorRow } from "./contractor-shared";
import { one } from "@/kernel/config/embedded";

// Roster read: contract team members + their current rates. Two queries
// (team_members has no FK into compensation's current rows) merged in JS —
// the roster is a handful of people, not a paged table.
//
// Rates are pay data (the finance-cleared admins only): the caller passes includeRates from
// the people.pay atom, and when false the compensation query never runs — rates
// stay null server-side rather than being fetched and hidden.

type TmRow = {
  id: string;
  person_id: string;
  status: string;
  start_date: string | null;
  people: PersonNameRow | PersonNameRow[] | null;
  departments: { name: string } | { name: string }[] | null;
  positions: { title: string } | { title: string }[] | null;
};

type PersonNameRow = NamedPerson & { email: string };

export async function listContractors(
  includeRates: boolean,
): Promise<{ rows: ContractorRow[]; error: string | null }> {
  const { data: tms, error } = await companyOs
    .from("team_members")
    .select(
      "id, person_id, status, start_date, people!person_id(display_name, preferred_name, full_name, email), departments!department_id(name), positions!position_id(title)",
    )
    .eq("employment_type", "contract")
    .order("start_date", { ascending: true });
  if (error) return { rows: [], error: error.message };

  const ids = (tms ?? []).map((t) => t.id);
  const rateByTm = new Map<
    string,
    { hourly: number | null; overtime: number | null; billable: number | null; currency: string }
  >();
  if (includeRates && ids.length > 0) {
    const { data: comps, error: cErr } = await selectCompensationSensitive("team_member_id, comp_type, amount_cents, currency")
      .in("team_member_id", ids)
      .in("comp_type", ["hourly", "overtime", "billable"])
      .eq("is_current", true);
    if (cErr) return { rows: [], error: cErr.message };
    // finance owns compensation_sensitive; the shape is stated here, as the
    // read now comes through its door rather than from a literal column list.
    type CompRow = { team_member_id: string; comp_type: string; amount_cents: number | null; currency: string | null };
    for (const c of (comps ?? []) as unknown as CompRow[]) {
      const cur =
        rateByTm.get(c.team_member_id) ?? { hourly: null, overtime: null, billable: null, currency: "usd" };
      if (c.comp_type === "hourly") cur.hourly = num(c.amount_cents);
      if (c.comp_type === "overtime") cur.overtime = num(c.amount_cents);
      if (c.comp_type === "billable") cur.billable = num(c.amount_cents);
      // billable is always usd; the roster currency reflects the internal rates
      if (c.comp_type !== "billable") cur.currency = c.currency || "usd";
      rateByTm.set(c.team_member_id, cur);
    }
  }

  const rows: ContractorRow[] = (tms ?? []).map((t) => {
    const tm = t as unknown as TmRow;
    const person = one(tm.people);
    const rates = rateByTm.get(tm.id);
    return {
      id: tm.id,
      team_member_id: tm.id,
      person_id: tm.person_id,
      display_name: personName(person),
      email: person?.email ?? "",
      status: tm.status,
      start_date: tm.start_date,
      department: one(tm.departments)?.name ?? null,
      position: one(tm.positions)?.title ?? null,
      hourly_rate_cents: rates?.hourly ?? null,
      overtime_rate_cents: rates?.overtime ?? null,
      billable_rate_cents: rates?.billable ?? null,
      currency: rates?.currency ?? "usd",
    };
  });
  return { rows, error: null };
}
