import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { saigonToday } from "@/kernel/config/dates";
import { loadCapacity } from "@/entities/org/lib/capacity";
import { forecast, mondayOf } from "@/entities/org/lib/capacity-model";
import { ForecastTable } from "./ForecastTable";
import { FitCheck } from "./FitCheck";
import { RolesPanel } from "./RolesPanel";
import { CommitmentsPanel } from "./CommitmentsPanel";

export const metadata = {
  title: "Capacity",
  description: "Hours each role can give per week against the hours already committed, and whether new work fits.",
};

// Operations -> Capacity (S.7): can we take this work? Supply per ROLE against
// what has been committed of it, for the next twelve weeks, and a fit check for
// a piece of work not yet committed. The CEO's house rule shapes the whole
// screen: roles and hours, never people — no utilisation per person, no
// ranking, no person column anywhere.
//
// The week is the business week (Saigon's Monday), so the grid turns over at
// the same moment for everyone who opens it.
export default async function CapacityPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.operations");
  const today = saigonToday();
  const currentMonday = mondayOf(today);
  const data = await loadCapacity(currentMonday);
  const rows = forecast(data.roles, data.commitments, currentMonday);

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Capacity"
        sub="What each role can give per week against what is already committed. Roles and hours, never people."
      />

      <section className="admin-card admin-section-card u-mb-5">
        <h2 className="admin-card-title">Can we take this work?</h2>
        <FitCheck roles={data.roles} commitments={data.commitments} currentMonday={currentMonday} today={today} />
      </section>

      <div className="admin-section-label">Free hours, next 12 weeks</div>
      <ForecastTable roles={data.roles} rows={rows} />

      <RolesPanel roles={data.roles} positions={data.positions} today={today} />
      <CommitmentsPanel commitments={data.commitments} roles={data.roles} companies={data.companies} today={today} />
    </>
  );
}
