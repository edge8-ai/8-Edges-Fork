import { requirePermission } from "@/kernel/identity/access-request";
import { OnboardingDeckEmbed } from "@/entities/org/ui/company/OnboardingDeckEmbed";

export const metadata = { title: "Onboarding Deck" };

// /admin/company/onboarding-deck — the same embedded deck the team sees.
export default async function AdminOnboardingDeckPage() {
  // The page's declared permission (ADR 0013).
  await requirePermission("org.company");
  return <OnboardingDeckEmbed />;
}
