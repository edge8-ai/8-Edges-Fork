import type { TeamImpersonation } from "@/kernel/identity/team-assume";
import { EndTeamAssumeButton } from "./EndTeamAssumeButton";
import type { EndTeamAssume } from "./surface-slots";

// Shown on every Team page while a Super Admin views it as someone else (team
// assume). Never rendered for a person signed in as themselves: their
// impersonation is null by construction (kernel/identity/team-auth.ts). The
// control that ends the view belongs to the entity that owns assume and reaches
// the banner through the layout's slot (ADR 0025); without it the banner still
// says whose view this is, and Settings → Assume ends it.
export function TeamAssumeBanner({
  impersonation,
  viewingAsName,
  endTeamAssume,
}: {
  impersonation: TeamImpersonation;
  viewingAsName: string;
  endTeamAssume: EndTeamAssume | null;
}) {
  const minutesLeft = Math.max(0, Math.round((new Date(impersonation.expiresAt).getTime() - Date.now()) / 60000));
  return (
    <div className="admin-banner-warn">
      <span>
        <strong>Viewing as {viewingAsName}</strong>, read-only · signed in as {impersonation.adminEmail} · ends in {minutesLeft}m
      </span>
      {/* The banner shows only to the Super Admin who started the view, whose own access holds team.assume. */}
      {endTeamAssume && <EndTeamAssumeButton endTeamAssume={endTeamAssume} label="Exit" may={{ "team.assume": true }} />}
    </div>
  );
}
