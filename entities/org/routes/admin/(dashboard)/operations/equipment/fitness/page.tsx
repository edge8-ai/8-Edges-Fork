import { requirePermission } from "@/kernel/identity/access-request";
import Link from "next/link";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { Badge, type BadgeTone } from "@/kernel/ui/Badge";
import {
  loadFleetFitness,
  formatGb,
  RAM_FLOOR_GB,
  SSD_FLOOR_GB,
  RAM_PREFERRED_GB,
  type FitnessGrade,
  type GradedMachine,
} from "@/entities/org/lib/fleet-fitness";

export const metadata = {
  title: "Fleet fitness",
  description: "Grades the laptops our engineers use against the hardware policy.",
};

const GRADE_TONE: Record<FitnessGrade, BadgeTone> = {
  pass: "ok",
  watch: "warn",
  fail: "err",
  data_gap: "neutral",
};

const GRADE_LABEL: Record<FitnessGrade, string> = {
  pass: "Pass",
  watch: "Watch",
  fail: "Fail",
  data_gap: "Data gap",
};

function GradeBadge({ grade }: { grade: FitnessGrade }) {
  return <Badge tone={GRADE_TONE[grade]}>{GRADE_LABEL[grade]}</Badge>;
}

function specText(m: GradedMachine): string {
  return `${formatGb(m.ramGb)} / ${formatGb(m.ssdGb)}`;
}

function GradeTable({ machines }: { machines: GradedMachine[] }) {
  return (
    <div className="admin-table-wrap">
      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Holder</th>
              <th>Title</th>
              <th>Spec</th>
              <th>Year</th>
              <th>Grade</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {machines.map((m) => (
              <tr key={m.id}>
                <td>{m.asset_tag}</td>
                <td>{m.holderName ?? "—"}</td>
                <td>{m.title ?? "—"}</td>
                <td>{specText(m)}</td>
                <td>{m.modelYear ?? "—"}</td>
                <td>
                  <GradeBadge grade={m.grade} />
                </td>
                <td>{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function FleetFitnessPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.operations");
  const fit = await loadFleetFitness();

  return (
    <>
      <PageHead
        eyebrow="Operations · Equipment"
        title="Fleet fitness"
        sub={`Engineer laptops graded against the hardware floor (${RAM_FLOOR_GB} GB RAM / ${formatGb(
          SSD_FLOOR_GB,
        )}, preferred ${RAM_PREFERRED_GB} GB / 1 TB). Macs first.`}
        action={
          <Link href="/admin/operations/equipment" className="admin-btn">
            Back to register
          </Link>
        }
      />

      <div className="admin-summary-grid u-mb-4">
        <MetricCard label="Macs below floor" value={fit.counts.macFail} sub="Engineer laptops that fail" />
        <MetricCard label="At the floor" value={fit.counts.macWatch} sub="Watch, plan ahead" />
        <MetricCard label="Meets the floor" value={fit.counts.macPass} sub="Pass" />
        <MetricCard label="Under-spec buys" value={fit.purchaseGuard.length} sub="Bought below floor, last 90 days" />
      </div>

      <section className="admin-section-card u-mb-4">
        <div className="admin-section-label">Upgrade priority</div>
        {fit.upgradeList.length === 0 ? (
          <p className="admin-page-sub">No engineer Macs are below the floor.</p>
        ) : (
          <>
            <p className="admin-page-sub u-mb-3">
              Worst first. Current failures are RAM-bound; disks are adequate. AI Engineers are the priority group.
            </p>
            <ol className="u-m-0 u-pl-4">
              {fit.upgradeList.map((m) => (
                <li key={m.id} className="u-mb-2">
                  <strong>
                    {m.asset_tag} — {m.holderName ?? "Unassigned"}
                  </strong>{" "}
                  ({m.title ?? "Engineer"}): {specText(m)}.
                  {m.title && /ai/i.test(m.title) ? " AI Engineer." : ""}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="admin-section-card u-mb-4">
        <div className="admin-section-label">Engineer Macs</div>
        <GradeTable machines={fit.macEngineers} />
      </section>

      <section className="admin-section-card u-mb-4">
        <div className="admin-section-label">Redistribution</div>
        {fit.redistribution.length === 0 ? (
          <p className="admin-page-sub">No capable spare in stock.</p>
        ) : (
          <ul className="u-m-0 u-pl-4">
            {fit.redistribution.map((m) => (
              <li key={m.id} className="u-mb-2">
                <strong>{m.asset_tag}</strong> in stock: {m.brand ?? "Unknown"} {specText(m)}.{" "}
                {m.isMac
                  ? "Mac, a direct swap for a failing engineer Mac."
                  : "Windows, so it cannot replace a Mac. Recommend a Mac buy instead."}
              </li>
            ))}
          </ul>
        )}
      </section>

      {fit.purchaseGuard.length > 0 && (
        <section className="admin-section-card u-mb-4">
          <div className="admin-section-label">Purchase guard</div>
          <p className="admin-page-sub u-mb-3">
            Bought below the floor in the last 90 days and assigned to an engineer.
          </p>
          <ul className="u-m-0 u-pl-4">
            {fit.purchaseGuard.map((m) => (
              <li key={m.id} className="u-mb-2">
                <strong>
                  {m.asset_tag} — {m.holderName ?? "Unassigned"}
                </strong>
                : {m.brand ?? "Unknown"} {specText(m)}, purchased {m.purchaseDate?.slice(0, 10)}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {fit.dataGaps.length > 0 && (
        <section className="admin-section-card u-mb-4">
          <div className="admin-section-label">Data gaps</div>
          <ul className="u-m-0 u-pl-4">
            {fit.dataGaps.map((m) => (
              <li key={m.id} className="u-mb-2">
                <strong>{m.asset_tag}</strong> ({m.holderName ?? "in stock"}): {m.reason}.{" "}
                <Link href={`/admin/operations/equipment`}>Fix in register</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="admin-section-card u-mb-4">
        <div className="admin-section-label">Appendix · Other engineer laptops</div>
        {fit.otherEngineers.length === 0 ? (
          <p className="admin-page-sub">None.</p>
        ) : (
          <GradeTable machines={fit.otherEngineers} />
        )}
      </section>

      <section className="admin-section-card">
        <div className="admin-section-label">Appendix · Out of scope (not graded)</div>
        {fit.outOfScope.length === 0 ? (
          <p className="admin-page-sub">None.</p>
        ) : (
          <ul className="u-m-0 u-pl-4">
            {fit.outOfScope.map((m) => (
              <li key={m.id} className="u-mb-1">
                {m.asset_tag}: {m.holderName ?? "Unassigned"} — {m.title ?? "no title"} ({m.brand ?? "?"}{" "}
                {specText(m)})
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
