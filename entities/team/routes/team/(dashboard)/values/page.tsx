import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { heroFont } from "@/kernel/ui/hero-font";
import {
  assignMarks,
  CoreValuesFrame,
  CoreValuesHero,
  CoreValuesMeet,
  CoreValuesState,
  loadCoreValues,
  ValueTile,
} from "@/entities/org";

export const metadata = {
  title: "Core Values",
  description: "How we work, whatever we're working on.",
};

// /team/values — the company's core values, company-visible and read-only:
// the page a new starter is shown. Rows live in company_os.core_values and
// are edited at /admin/company/values, which renders these same tiles.
export default async function TeamValuesPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  const access = await requirePermission("team.culture");
  await requireTeamMember();
  const values = await loadCoreValues();
  const marks = assignMarks(values ?? []);

  return (
    <CoreValuesFrame fontClass={heroFont.variable} className="is-first">
      {values && access.may("org.company") && (
        <div className="admin-cv-toprow">
          <Link className="admin-btn admin-btn--sm" href="/admin/company/values">
            Edit values
          </Link>
        </div>
      )}
      <CoreValuesHero values={values ?? []} marks={marks} />
      {values === null ? (
        <CoreValuesState title="The values didn't load" alert>
          <p>This is a fault on our side, not an empty page. Reload to try again.</p>
        </CoreValuesState>
      ) : values.length === 0 ? (
        <CoreValuesState title="No values published yet">
          <p>When the company publishes its values, they appear here.</p>
        </CoreValuesState>
      ) : (
        <>
          <ol className="admin-cv-grid" aria-label="Core values">
            {values.map((v, i) => (
              <ValueTile key={v.id} value={v} index={i} count={values.length} mark={marks.get(v.id) ?? "spark"} />
            ))}
          </ol>
          <CoreValuesMeet coachHref={access.may("coaching.mine") ? "/team/my-coaching" : undefined} />
        </>
      )}
    </CoreValuesFrame>
  );
}
