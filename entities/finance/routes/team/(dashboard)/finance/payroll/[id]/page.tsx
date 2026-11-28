import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { NAME_COLUMNS, personName } from "@/kernel/config/people-name";
import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatVndWhole, formatMonth } from "@/kernel/ui/format";
import { getPayrollRun, workbookLink } from "@/entities/finance/lib/payroll/store";

export const metadata = { title: "Payroll month" };

// One payroll month: each person's line as the workbook states it, and the
// workbook itself to download.
export default async function PayrollMonthPage(props: { params: Promise<{ id: string }> }) {
  // The page's declared permission (ADR 0013).
  await requirePermission("finance.payroll");
  const { id } = await props.params;
  const found = await getPayrollRun(id);
  if (!found) notFound();
  const { run, lines } = found;

  const [names, link] = await Promise.all([
    lines.length
      ? companyOs
          .from("team_members")
          .select(`id, people!team_members_person_id_fkey(${NAME_COLUMNS})`)
          .in("id", lines.map((l) => l.teamMemberId))
      : Promise.resolve({ data: [], error: null }),
    workbookLink(run.legalEntityId, run.period),
  ]);
  const nameOf = new Map(
    (mustRows(names, "[finance/payroll] team member names") as unknown as { id: string; people: Parameters<typeof personName>[0] }[]).map((t) => [t.id, personName(t.people, "Team member")]),
  );

  return (
    <>
      <PageHead
        eyebrow="Payroll"
        title={formatMonth(run.period)}
        sub={`${run.lines} ${run.lines === 1 ? "person" : "people"}${run.workingDays ? ` · ${run.workingDays} working days` : ""}${run.isEstimate ? " · marked as an estimate" : ""} · from ${run.sourceFile ?? "a workbook"}`}
        action={
          link.url ? (
            <a className="admin-btn" href={link.url}>
              Download workbook
            </a>
          ) : link.error ? (
            <span className="u-muted">The workbook could not be reached just now. Reload to try again.</span>
          ) : undefined
        }
      />
      <section className="admin-card admin-section-card">
        <div className="admin-list">
          {lines.map((l) => (
            <div key={`${l.teamMemberId}:${l.contractKind}`} className="admin-list-row">
              <div className="admin-list-main">
                <div className="admin-list-title">{nameOf.get(l.teamMemberId) ?? "Team member"}</div>
                <div className="admin-list-sub">
                  {[l.position, l.contractKind === "service" ? "service contract" : null, l.daysWorked !== null ? `${l.daysWorked} days` : null, `gross ${formatVndWhole(l.grossVnd)}`, `PIT ${formatVndWhole(l.pitVnd)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="admin-list-aside">
                <span className="u-strong">{formatVndWhole(l.paidVnd ?? l.netVnd)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
