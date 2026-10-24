import { notFound } from "next/navigation";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { getPersonalProfile } from "@/entities/portal/lib/profile";
import { PageHead } from "@/kernel/ui/PageHead";
import { ProfileForm } from "./ProfileForm";

export const metadata = {
  title: "Personal Profile",
  description: "Your own contact details.",
};

// Self-scoped, open to every role: this is the actor's own person record.
export default async function PortalProfilePage() {
  const actor = await requirePortalPermission("surface.portal");
  const profile = await getPersonalProfile(actor);
  if (!profile) notFound();

  return (
    <div className="u-max-narrow">
      <PageHead
        eyebrow="Account"
        title="Personal Profile"
        sub="Your own details. Your company's details live on the Company Profile page."
      />
      <ProfileForm initial={profile} canEditTitle={actor.companyScope.length === 1} />
    </div>
  );
}
