// Who a payroll line can be paid to, and the employer a workbook belongs to:
// read here for both the Finance → Payroll upload and
// scripts/payroll-backfill.mts, so a month loaded by the script is matched
// against exactly the people an upload of the same file would be. This is not a
// "use server" file, so neither function is reachable as a server action.
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { selectPeopleSensitive } from "@/entities/contacts";
import { selectLegalEntities } from "@/entities/org";
import type { PayrollPerson } from "@/entities/finance/lib/payroll/match";

type PersonRow = {
  id: string;
  person_id: string;
  start_date: string | null;
  end_date: string | null;
  people: { full_name: string | null; display_name: string | null; preferred_name: string | null; email: string } | null;
};

export async function payrollPeople(): Promise<PayrollPerson[]> {
  const [tmRes, sensRes] = await Promise.all([
    companyOs.from("team_members").select(`id, person_id, start_date, end_date, people!team_members_person_id_fkey(${NAME_COLUMNS})`),
    selectPeopleSensitive("person_id, tax_code, national_id_number"),
  ]);
  const tms = mustRows(tmRes, "[finance/payroll] team_members") as unknown as PersonRow[];
  const sens = new Map(
    (mustRows(sensRes, "[finance/payroll] people_sensitive") as { person_id: string; tax_code: string | null; national_id_number: string | null }[]).map((s) => [s.person_id, s]),
  );
  return tms.map((t) => {
    const s = sens.get(t.person_id);
    return {
      teamMemberId: t.id,
      label: personName(t.people, "Team member"),
      // Every name on the record is tried: the workbook may use any of them.
      names: [t.people?.full_name, t.people?.display_name, t.people?.preferred_name].filter((n): n is string => Boolean(n)),
      ids: [s?.tax_code, s?.national_id_number].filter((v): v is string => Boolean(v)).map(String),
      startDate: t.start_date,
      endDate: t.end_date,
    };
  });
}

// Every workbook so far is the Vietnamese entity's.
export async function vietnamEntityId(): Promise<string> {
  const entities = mustRows(await selectLegalEntities("id, country"), "[finance/payroll] legal_entities") as { id: string; country: string | null }[];
  const vn = entities.filter((e) => (e.country ?? "").toUpperCase() === "VN");
  if (vn.length !== 1) throw new Error("Expected exactly one Vietnamese legal entity.");
  return vn[0].id;
}
