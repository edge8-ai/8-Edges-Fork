import Link from "next/link";
import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { peopleOnRecord } from "@/kernel/identity/team-people";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { firstParam, type SearchParamsObj } from "@/kernel/ui/url";
import { listProfiles, readProfile } from "@/entities/replenishment";
import { ImportProfile } from "./ImportProfile";
import { ProfileEditor } from "./ProfileEditor";

export const metadata = {
  title: "Replenishment profile",
  description: "A warehouse's rules for turning a stock export into restocking jobs.",
};

// Operations → Warehouse → Profile (RP.3, RP.6; spec 2026-10-28, "Surfaces").
// One stored profile in the editor: the export's columns, the zones and walking
// order, the item rules and bands, where stock goes and the operator's words,
// with a preview against the last stored export. The editor is the one client
// component and holds the draft; this page only reads. Profiles are listed by
// name and picked with ?profile=, so a second warehouse needs no code.

export default async function ReplenishmentProfilePage(props: { searchParams: Promise<SearchParamsObj> }) {
  const access = await requirePermission("replenishment.profiles");
  const searchParams = await props.searchParams;
  const profiles = await listProfiles();
  const wanted = firstParam(searchParams.profile);
  const chosen = profiles.find((p) => p.id === wanted) ?? profiles[0] ?? null;
  const stored = chosen ? await readProfile(chosen.id) : null;
  const savedBy = stored?.savedBy ? (await peopleOnRecord([stored.savedBy])).get(stored.savedBy)?.name ?? null : null;
  const may = mayProp(access, ["replenishment.profiles"]);

  return (
    <>
      <PageHead
        eyebrow="Operations · Warehouse"
        title="Replenishment profile"
        sub="How a stock export becomes the operator's job list. Every rule here is data: change a number and the preview recounts."
      />

      {profiles.length > 1 && (
        <nav className="admin-chiplist u-mb-3" aria-label="Profiles">
          {profiles.map((p) => (
            <Link
              key={p.id}
              href={`/admin/operations/replenishment/profile?profile=${p.id}`}
              className={p.id === chosen?.id ? "admin-chip is-active" : "admin-chip"}
              aria-current={p.id === chosen?.id ? "page" : undefined}
            >
              {p.name} ({p.warehouse})
            </Link>
          ))}
        </nav>
      )}

      {profiles.length === 0 && (
        <div className="admin-alert admin-alert--info u-mb-3">
          No profile yet. Import one to describe this warehouse: its export&apos;s columns, its zones, its rules and the words the scanner shows.
        </div>
      )}
      <div className="u-mb-3">
        <ImportProfile may={may} defaultOpen={profiles.length === 0} />
      </div>

      {chosen && !stored && <div className="admin-alert admin-alert--warn">That profile was archived a moment ago. Reload the page.</div>}

      {stored && (
        <>
          <p className="admin-cell-muted u-mb-3">
            {stored.name} · {stored.warehouse} · version {stored.version}, saved {formatDate(stored.savedAt)}
            {savedBy ? ` by ${savedBy}` : ""}
          </p>
          {stored.profile ? (
            <ProfileEditor key={stored.id} may={may} id={stored.id} name={stored.name} warehouse={stored.warehouse} version={stored.version} profile={stored.profile} />
          ) : (
            <div className="admin-alert admin-alert--err" role="alert">
              <Badge tone="err">Cannot be used</Badge> The stored profile no longer passes its checks, so no run can be made from it.
              Import a corrected file. {stored.problem}
            </div>
          )}
        </>
      )}
    </>
  );
}
