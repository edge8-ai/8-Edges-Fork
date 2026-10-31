import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { heroFont } from "@/kernel/ui/hero-font";
import { loadCoreValues } from "@/entities/org/lib/core-values-read";
import { CoreValuesFrame, CoreValuesState } from "@/entities/org/ui/company/CoreValuesBento";
import { ValuesEditor } from "./ValuesEditor";

export const metadata = { title: "Core Values" };

// /admin/company/values — edit the core values on the page the team reads:
// the editor is /team/values with controls on each tile, so what an admin sees
// while editing is what everyone sees after saving.
export default async function AdminValuesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.company");
  const values = await loadCoreValues();

  return (
    <CoreValuesFrame fontClass={heroFont.variable}>
      <div className="admin-cv-toprow">
        <p className="admin-cv-live">
          <b>Live on save.</b> Every change shows on the team page as soon as it saves.
        </p>
        <Link className="admin-btn admin-btn--sm" href="/team/values">
          View team page
        </Link>
      </div>
      {values === null ? (
        // Editing waits for a good read: an editor that showed "no values"
        // after a failed read is how duplicates got added.
        <CoreValuesState title="The values didn't load" alert>
          <p>Editing is paused until they load, so nothing gets added twice. Reload to try again.</p>
        </CoreValuesState>
      ) : (
        <ValuesEditor values={values} />
      )}
    </CoreValuesFrame>
  );
}
