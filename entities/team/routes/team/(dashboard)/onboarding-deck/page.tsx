import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { OnboardingDeckEmbed } from "@/entities/org";

export const metadata = { title: "Onboarding Deck" };

// /team/onboarding-deck — the team onboarding deck, embedded so members stay
// inside the portal. Same shared component as /admin/company/onboarding-deck.
export default async function TeamOnboardingDeckPage() {
  // The page's declared permission (entities/team/permissions.ts, ADR 0013).
  await requirePermission("team.culture");
  await requireTeamMember();
  return <OnboardingDeckEmbed />;
}
