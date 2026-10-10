import { companyOs } from "@/kernel/data/supabase";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

// Fleet Fitness: grade the laptops our engineers actually use against the
// hardware policy. Pure functions (parseGb, gradeSpec, isEngineerTitle) hold
// the logic so it can be reused by the quarterly routine and, later, the
// equipment form. loadFleetFitness does the read and returns a partitioned,
// graded view for the admin page.
//
// Policy (app development, no local model work): floor 24 GB RAM / 512 GB SSD,
// preferred 48 GB / 1 TB, flag a laptop past 4 years for the replacement cycle.
// Scope is engineers only, by job title. Macs are the priority.

export const RAM_FLOOR_GB = 24;
export const SSD_FLOOR_GB = 512;
export const RAM_PREFERRED_GB = 48;
export const REPLACEMENT_AGE_YEARS = 4;
// A purchase this recent that is still below the floor is a buy that slipped
// through, not old kit we already know about.
export const PURCHASE_GUARD_DAYS = 90;

export type FitnessGrade = "pass" | "watch" | "fail" | "data_gap";

// Reads "16GB", "36 GB", "512GB", "1TB", "1 TB" into integer GB. Returns null
// when there is no number+unit to read, which routes the machine to the data
// gaps list rather than letting it grade on a guess.
export function parseGb(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = String(raw).match(/(\d+(?:\.\d+)?)\s*(tb|gb|t|g)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = m[2].toLowerCase();
  return Math.round(unit === "tb" || unit === "t" ? n * 1024 : n);
}

// Scope is by job title: anything with "engineer" in the title. This
// deliberately includes AI, Data, Software, Mobile, Principal, and QA
// Automation Engineers, and excludes Designer, Recruiter, Founder, Bookkeeper,
// and Operations roles.
export function isEngineerTitle(title: string | null | undefined): boolean {
  return !!title && /engineer/i.test(title);
}

export function gradeSpec(
  ramGb: number | null,
  ssdGb: number | null,
  ageYears: number | null,
): { grade: FitnessGrade; reason: string } {
  if (ramGb == null || ssdGb == null) {
    return { grade: "data_gap", reason: "RAM or storage could not be read" };
  }
  if (ramGb < RAM_FLOOR_GB) {
    return { grade: "fail", reason: `${ramGb} GB RAM, below the ${RAM_FLOOR_GB} GB floor` };
  }
  if (ssdGb < SSD_FLOOR_GB) {
    return { grade: "fail", reason: `${ssdGb} GB SSD, below the ${SSD_FLOOR_GB} GB floor` };
  }
  if (ramGb === RAM_FLOOR_GB || ssdGb === SSD_FLOOR_GB) {
    return { grade: "watch", reason: `at the floor (${ramGb} GB / ${formatGb(ssdGb)})` };
  }
  if (ageYears != null && ageYears > REPLACEMENT_AGE_YEARS) {
    return { grade: "watch", reason: `${ageYears} years old, nearing replacement` };
  }
  return { grade: "pass", reason: `${ramGb} GB / ${formatGb(ssdGb)}` };
}

export function formatGb(gb: number | null): string {
  if (gb == null) return "?";
  return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} TB` : `${gb} GB`;
}

export type GradedMachine = {
  id: string;
  asset_tag: string;
  name: string | null;
  brand: string | null;
  status: string;
  holderName: string | null;
  title: string | null;
  department: string | null;
  ram: string | null;
  storage: string | null;
  ramGb: number | null;
  ssdGb: number | null;
  modelYear: number | null;
  purchaseDate: string | null;
  ageYears: number | null;
  isMac: boolean;
  isEngineer: boolean;
  grade: FitnessGrade;
  reason: string;
};

export type FleetFitness = {
  macEngineers: GradedMachine[];
  otherEngineers: GradedMachine[];
  upgradeList: GradedMachine[];
  redistribution: GradedMachine[];
  purchaseGuard: GradedMachine[];
  dataGaps: GradedMachine[];
  outOfScope: GradedMachine[];
  counts: { macFail: number; macWatch: number; macPass: number };
};

type EquipmentFitnessRow = {
  id: string;
  asset_tag: string;
  name: string | null;
  brand: string | null;
  ram: string | null;
  storage: string | null;
  model_year: number | null;
  purchase_date: string | null;
  status: string;
  current_holder_id: string | null;
  holder: ({ id: string } & NamedPerson) | null;
};

type RoleRow = { person_id: string; position_title: string | null; department_name: string | null };

// One template literal from end to end: check-table-ownership reads a SELECT
// constant only when it opens and closes with the same quote.
const EQ_FITNESS_SELECT =
  `id, asset_tag, name, brand, ram, storage, model_year, purchase_date, status, current_holder_id, holder:people!equipment_current_holder_id_fkey(id, ${NAME_COLUMNS})`;

function yearOf(row: EquipmentFitnessRow): number | null {
  if (row.model_year) return row.model_year;
  if (row.purchase_date) {
    const y = new Date(row.purchase_date).getFullYear();
    return Number.isNaN(y) ? null : y;
  }
  return null;
}

// Grades every laptop in the register against its holder's role. Reads two
// company_os relations: equipment (laptops) and the current_team_members view
// for role, joined on holder id = person_id.
export async function loadFleetFitness(asOf: Date = new Date()): Promise<FleetFitness> {
  const [{ data: eqData }, { data: roleData }] = await Promise.all([
    companyOs.from("equipment").select(EQ_FITNESS_SELECT).eq("type", "laptop").is("archived_at", null),
    companyOs.from("current_team_members").select("person_id, position_title, department_name"),
  ]);

  const rows = (eqData ?? []) as unknown as EquipmentFitnessRow[];
  const roles = new Map<string, RoleRow>(
    ((roleData ?? []) as RoleRow[]).map((r) => [r.person_id, r]),
  );

  const graded: GradedMachine[] = rows.map((row) => {
    const role = row.current_holder_id ? roles.get(row.current_holder_id) : undefined;
    const ramGb = parseGb(row.ram);
    const ssdGb = parseGb(row.storage);
    const year = yearOf(row);
    const ageYears = year != null ? asOf.getFullYear() - year : null;
    const { grade, reason } = gradeSpec(ramGb, ssdGb, ageYears);
    return {
      id: row.id,
      asset_tag: row.asset_tag,
      name: row.name,
      brand: row.brand,
      status: row.status,
      holderName: personName(row.holder, null),
      title: role?.position_title ?? null,
      department: role?.department_name ?? null,
      ram: row.ram,
      storage: row.storage,
      ramGb,
      ssdGb,
      modelYear: row.model_year,
      purchaseDate: row.purchase_date,
      ageYears,
      isMac: row.brand === "Apple",
      isEngineer: isEngineerTitle(role?.position_title),
      grade,
      reason,
    };
  });

  const inUseEngineers = graded.filter((m) => m.status === "in_use" && m.isEngineer);
  const macEngineers = inUseEngineers.filter((m) => m.isMac);
  const otherEngineers = inUseEngineers.filter((m) => !m.isMac);

  // Worst first: RAM-bound failures ahead of storage-bound, smallest RAM first.
  const upgradeList = macEngineers
    .filter((m) => m.grade === "fail")
    .sort((a, b) => (a.ramGb ?? 0) - (b.ramGb ?? 0));

  // A shelf machine that clears the floor comfortably (preferred RAM) could
  // rehome a failure. The page adds the platform caveat.
  const redistribution = graded.filter(
    (m) => m.status === "in_stock" && (m.grade === "pass" || (m.ramGb ?? 0) >= RAM_PREFERRED_GB),
  );

  const guardCutoff = new Date(asOf.getTime() - PURCHASE_GUARD_DAYS * 24 * 60 * 60 * 1000);
  const purchaseGuard = inUseEngineers.filter(
    (m) => m.grade === "fail" && m.purchaseDate != null && new Date(m.purchaseDate) >= guardCutoff,
  );

  const dataGaps = graded.filter(
    (m) => m.grade === "data_gap" && (m.status === "in_use" || m.status === "in_stock"),
  );

  const outOfScope = graded.filter((m) => m.status === "in_use" && !m.isEngineer);

  return {
    macEngineers,
    otherEngineers,
    upgradeList,
    redistribution,
    purchaseGuard,
    dataGaps,
    outOfScope,
    counts: {
      macFail: macEngineers.filter((m) => m.grade === "fail").length,
      macWatch: macEngineers.filter((m) => m.grade === "watch").length,
      macPass: macEngineers.filter((m) => m.grade === "pass").length,
    },
  };
}
