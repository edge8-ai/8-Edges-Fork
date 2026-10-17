import { endTeamAssume } from "@/entities/team/lib/assume";
import type { TeamImpersonation } from "@/kernel/identity/team-assume";
import { EndTeamAssumeButton } from "./EndTeamAssumeButton";

// Shown on every Team page while a Super Admin views it as someone else (team
// assume). Never rendered for a person signed in as themselves: their
// impersonation is null by construction (kernel/identity/team-auth.ts).
export function TeamAssumeBanner({ impersonation, viewingAsName }: { impersonation: TeamImpersonation; viewingAsName: string }) {
  const minutesLeft = Math.max(0, Math.round((new Date(impersonation.expiresAt).getTime() - Date.now()) / 60000));
  return (
    <div className="admin-banner-warn">
      <span>
        <strong>Viewing as {viewingAsName}</strong>, read-only · signed in as {impersonation.adminEmail} · ends in {minutesLeft}m
      </span>
      {/* The banner shows only to the Super Admin who started the view, whose own access holds team.assume. */}
      <EndTeamAssumeButton endTeamAssume={endTeamAssume} label="Exit" may={{ "team.assume": true }} />
    </div>
  );
}
