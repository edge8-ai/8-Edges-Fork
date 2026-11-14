// The client portal's composition root. Like the Admin and team layouts this is
// not a mount: the navigation is generated from this deployment's entity list
// (ADR 0002), so app/ is the only place it can be named. It guards the surface,
// resolves the entitlements the nav is filtered on, and renders the shell.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePortalMember } from "@/kernel/identity/portal-auth";
import { RefreshOnStale } from "@/kernel/shell/RefreshOnStale";
import { PortalSidebar } from "@/kernel/shell/PortalSidebar";
import { PortalAssumeBanner } from "@/kernel/shell/PortalAssumeBanner";
// What the shell shows of this client arrives through the generated module
// (ADR 0025): the portal entity provides the entitlements, the programme names
// and the Assume exit, so this file names no entity.
import { endAssumeSession, listProgramNamesForActor, portalEntitlements } from "@/app/shell";
import { PORTAL_NAV } from "@/app/nav";
import "../../admin/admin.css";
import "@/app/styles/utilities.css";

export const metadata: Metadata = {
  title: { template: "%s · 8 Edges Client Portal", default: "8 Edges Client Portal" },
  description: "Your Edge8 client portal.",
  robots: { index: false, follow: false },
};

export default async function PortalDashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePortalMember();
  // Temp-password holders pick their own password before seeing any data. The
  // target page lives in the (auth) group, outside this layout, so no loop.
  if (actor.mustChangePassword) redirect("/portal/change-password");
  const companyName =
    actor.memberships.length === 1
      ? actor.memberships[0].companyName
      : actor.memberships.map((m) => m.companyName).filter(Boolean).join(" · ") || null;
  const [entitlements, programs] = await Promise.all([
    portalEntitlements(actor),
    listProgramNamesForActor(actor),
  ]);

  return (
    <div className="admin-fullheight">
      <RefreshOnStale />
      {actor.impersonation && endAssumeSession && (
        <PortalAssumeBanner
          impersonation={actor.impersonation}
          viewingAsName={actor.displayName}
          companyName={companyName}
          endAssume={endAssumeSession}
        />
      )}
      <div className="admin-shell u-grow u-minh-0">
        <PortalSidebar
          sections={PORTAL_NAV}
          name={actor.displayName}
          email={actor.email}
          companyName={companyName}
          entitlements={entitlements}
          programs={programs}
          endAssume={actor.impersonation ? endAssumeSession : null}
        />
        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
