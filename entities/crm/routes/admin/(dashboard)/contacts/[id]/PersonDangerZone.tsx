"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { deletePerson } from "@/entities/crm/lib/contacts-actions";

// Delete permanently (GDPR erasure) only. Archive / Restore live in the shared
// CrmCommandBar (shelf + profile); permanent erasure stays profile-only here.
export function PersonDangerZone({
  personId,
  personName,
}: {
  personId: string;
  personName: string;
}) {
  const router = useRouter();

  return (
    <div className="admin-danger-zone">
      <div className="admin-danger-zone-title">Danger zone</div>

      <div className="admin-danger-row">
        <span className="admin-danger-row-text">
          Permanently erase this person and their qualifications, interactions and relationships (GDPR
          right to erasure). Cannot be undone, and is blocked while they have orders, bookings or deals.
        </span>
        <ConfirmButton
          label="Delete permanently"
          title="Permanently erase this contact?"
          body={
            <>
              This erases <strong>{personName}</strong> and their linked history under GDPR
              right-to-erasure. This cannot be undone.
            </>
          }
          confirmLabel="Erase permanently"
          typeToConfirm={personName}
          onConfirm={() => deletePerson(personId)}
          onDone={() => router.push("/admin/contacts")}
        />
      </div>
    </div>
  );
}
