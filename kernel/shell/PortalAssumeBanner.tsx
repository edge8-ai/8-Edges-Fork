import type { PortalImpersonation } from "@/kernel/identity/portal-auth";

// Persistent, unmissable banner while an admin is viewing /portal via Assume.
// Never rendered for a real client — impersonation is null for them by
// construction (kernel/identity/portal-auth.ts). The control that ends the view
// belongs to the portal entity and reaches the banner through the layout's slot
// (ADR 0025), so the shell names no entity.
export function PortalAssumeBanner({
  impersonation,
  viewingAsName,
  companyName,
  endAssume,
}: {
  impersonation: PortalImpersonation;
  viewingAsName: string;
  companyName: string | null;
  endAssume: () => void | Promise<void>;
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
      <form action={endAssume}>
        <button type="submit" className="admin-btn admin-btn--sm">
          Exit
        </button>
      </form>
    </div>
  );
}
