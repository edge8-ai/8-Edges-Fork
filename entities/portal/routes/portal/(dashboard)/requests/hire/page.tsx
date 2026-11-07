import { requirePortalPermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { TeamBuilderForm } from "./TeamBuilderForm";

export const metadata = {
  title: "Build Your Team",
  description: "Build a full-time team of Edge8 members based in Vietnam and estimate the budget.",
};

export default async function HireRequestPage() {
  const actor = await requirePortalPermission("surface.portal");
  const companies = actor.memberships
    .filter((m) => m.companyId)
    .map((m) => ({ id: m.companyId as string, name: m.companyName ?? "Your company" }));

  return (
    <div className="admin-content--form">
      <PageHead
        eyebrow="Client Portal · Requests"
        title="Build Your Team"
        sub="Add each role you want, pick experience and tech stack, and see your estimated budget. Build a team of 3 or more for 10% off."
      />
      {companies.length === 0 ? (
        <div className="admin-empty">
          Your portal access isn&apos;t linked to a company yet. Reply to your Edge8 contact to fix this.
        </div>
      ) : (
        <TeamBuilderForm companies={companies} />
      )}
    </div>
  );
}
