import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { listCurrentTeamPeople } from "@/kernel/identity/team-people";
import { saigonToday } from "@/kernel/config/dates";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import { loadLegalEntities } from "@/entities/org/lib/legal-entities";
import { AddLegalEntity } from "./AddLegalEntity";
import { LegalEntitiesTable } from "./LegalEntitiesTable";

export const metadata = {
  title: "Legal entities",
  description: "The organisation's registered companies: legal names and registration details.",
};

// Settings → Legal entities. The organisation's registered companies, which
// other screens read: a reimbursement claim shows the paying company's legal
// name and tax code so the claimant can ask the seller for a red invoice. No
// company is named in this file; every name comes from the rows, so a fork
// renders its own.
//
// Two permissions meet here. Whoever keeps the registration details current
// (org.legal-registration: Finance and a Super Admin) opens the page; only a
// Super Admin (org.legal-entities) adds a company or changes the company
// itself, and everyone else sees those fields read-only.
export default async function LegalEntitiesPage(props: { searchParams: Promise<{ open?: string | string[] }> }) {
  // The page's declared permission (ADR 0013).
  const access = await requirePermission("org.legal-registration");
  // What the client controls show, answered once here (ADR 0014).
  const may = mayProp(access, ["org.legal-entities", "org.legal-registration"]);
  const [entities, people, params] = await Promise.all([loadLegalEntities(), listCurrentTeamPeople(), props.searchParams]);
  // ?open=<slug> opens that entity's drawer: the reimbursement VAT box links
  // here on the buyer it shows (RB.15). A slug no row has opens nothing.
  const openSlug = typeof params.open === "string" ? params.open : null;
  const initialOpenId = entities.find((e) => e.record.slug === openSlug)?.record.id ?? null;

  return (
    <>
      <PageHead
        eyebrow="Settings"
        title="Legal entities"
        sub="The organisation's registered companies. The law expects the registration details to match the registration whenever anything changes, so Finance keeps them current; a Super Admin adds and names the companies. Other screens read them: every reimbursement claim shows the paying company's legal name and tax code. Every change records who made it, when and why."
        action={may["org.legal-entities"] ? <AddLegalEntity may={may} /> : undefined}
      />
      <LegalEntitiesTable entities={entities} initialOpenId={initialOpenId} context={{ may, people, today: saigonToday() }} />
      <p className="admin-legal-note">
        <Badge>Who can change these</Badge>
        <span>Finance and Super Admins keep the registration details; only a Super Admin adds a company or changes it. Roles are granted in Settings › Access.</span>
      </p>
    </>
  );
}
