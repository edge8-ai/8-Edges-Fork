"use client";

import { useRouter } from "next/navigation";
import { useSurfaceBase } from "@/kernel/shell/surface-client";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { deleteCompany } from "@/entities/crm/lib/companies-actions";

// Delete permanently only. Archive / Restore live in the shared CrmCommandBar
// (shelf + profile); permanent delete stays profile-only, in this danger zone.
export function CompanyDangerZone({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const router = useRouter();
  const surface = useSurfaceBase();

  return (
    <div className="admin-danger-zone">
      <div className="admin-danger-zone-title">Danger zone</div>

      <div className="admin-danger-row">
        <span className="admin-danger-row-text">
          Permanently delete this company. Cannot be undone, and is blocked while it has linked deals, job
          requisitions or projects.
        </span>
        <ConfirmButton
          label="Delete permanently"
          title="Permanently delete this company?"
          body={
            <>
              This deletes <strong>{companyName}</strong>. This cannot be undone.
            </>
          }
          confirmLabel="Delete permanently"
          typeToConfirm={companyName}
          onConfirm={() => deleteCompany(companyId)}
          onDone={() => router.push(`${surface}/revenue/companies`)}
        />
      </div>
    </div>
  );
}
