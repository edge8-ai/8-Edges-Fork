import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { refuseReportingLine } from "./org-tree";

// The one check every reporting-line write passes through: the org chart's
// edit mode and the Talent record's manager field. It reads the whole graph
// (a few dozen rows), because a loop can only be seen from the top of it. A
// failed read raises rather than saying "no loop", since the permissive answer
// is the wrong one here.
export async function reportingLineRefusal(memberId: string, managerId: string | null): Promise<string | null> {
  if (!managerId) return null;
  const rows = mustRows(
    await companyOs.from("team_members").select("id, manager_id, status"),
    "[org/reporting-lines] team_members",
  );
  return refuseReportingLine(
    rows.map((r) => ({ id: r.id, managerId: r.manager_id, status: r.status })),
    memberId,
    managerId,
  );
}
