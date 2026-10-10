import { requirePermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { PRIVATE_LIBRARY_SCOPE } from "@/kernel/identity/access-gate";
import { listAccessCodes } from "@/kernel/identity/access-codes";
import { AccessCodesManager, type AccessCodeView } from "./AccessCodesManager";

// Workspace → Access codes. One row per gated scope (the private library, a
// client's scope documents) with the code a visitor must type. Open to every admin;
// the codes are shown in full so they can be read back and sent to a
// client. The list is the table's rows, so this screen names no gate but the
// kernel's own; a gate with no row yet still works off its env var, and saving
// a code for its scope here writes the row, which wins from then on.

export default async function AccessCodesPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("company-os.settings");
  const listed = await listAccessCodes();
  const stored = listed.ok ? listed.rows : [];

  const rows: AccessCodeView[] = stored.map((r) => ({
    scope: r.scope,
    code: r.code,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
  if (!rows.some((r) => r.scope === PRIVATE_LIBRARY_SCOPE)) {
    rows.unshift({ scope: PRIVATE_LIBRARY_SCOPE, code: null, updatedAt: null, updatedBy: null });
  }

  return (
    <>
      <PageHead
        eyebrow="Workspace"
        title="Access codes"
        sub="The shared code for each private document gate. A change takes effect on the next unlock, with no deploy."
      />

      {!listed.ok && (
        <div className="admin-alert admin-alert--err">
          Could not read the stored codes ({listed.error}). Gates are running on their env fallback.
        </div>
      )}

      <AccessCodesManager rows={rows} />
    </>
  );
}
