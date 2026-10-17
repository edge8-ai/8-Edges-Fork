import { endAssumeSession } from "@/entities/portal/lib/actions";
import type { PortalImpersonation } from "@/kernel/identity/portal-auth";

// Persistent, unmissable banner while an admin is viewing /portal via Assume.
// Never rendered for a real client — impersonation is null for them by
// construction (lib/portal-auth.ts).
export function AssumeBanner({
  impersonation,
  viewingAsName,
  companyName,
}: {
  impersonation: PortalImpersonation;
  viewingAsName: string;
  companyName: string | null;
}) {
  const expiresIn = Math.max(
    0,
    Math.round((new Date(impersonation.expiresAt).getTime() - Date.now()) / 60000),
  );

  return (
    <div
      className="admin-banner-warn"
    >
      <span>
        <strong>Admin view</strong> — viewing as {viewingAsName}
        {companyName ? ` (${companyName})` : ""} · signed in as {impersonation.adminEmail} ·
        expires in {expiresIn}m
      </span>
      <form action={endAssumeSession}>
        <button type="submit" className="admin-btn admin-btn--sm">
          Exit
        </button>
      </form>
    </div>
  );
}
