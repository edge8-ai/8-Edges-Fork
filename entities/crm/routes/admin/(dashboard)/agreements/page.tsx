import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { PageHead } from "@/kernel/ui/PageHead";
import { AGREEMENT_TYPES, AGREEMENT_TYPE_LABEL, listAgreements } from "@/entities/crm/lib/agreements";
import { listTeamMemberSigners } from "@/entities/crm/lib/agreement-prepare";
import { AgreementCard } from "./AgreementCard";
import { agreementView, type AgreementView } from "./agreement-view";

// Every agreement Edge8 signs, of every type (E-signature, AG.1): where an
// employee's or contractor's agreement is prepared, signed for Edge8 and
// sent, and where a client's can be found beside its deal. Only a holder of
// crm.agreements (a Super Admin) opens it.
export default async function AgreementsPage() {
  const access = await requirePermission("crm.agreements");
  const [agreements, members] = await Promise.all([
    listAgreements()
      .then((list) => Promise.all(list.map(agreementView)))
      .catch((e: unknown): AgreementView[] | string => (e instanceof Error ? e.message : String(e))),
    listTeamMemberSigners(),
  ]);

  const counts =
    typeof agreements === "string"
      ? null
      : AGREEMENT_TYPES.map((t) => {
          const ofType = agreements.filter((a) => a.type === t);
          return { label: AGREEMENT_TYPE_LABEL[t], total: ofType.length, signed: ofType.filter((a) => a.status === "signed").length };
        }).filter((c) => c.total > 0);

  return (
    <>
      <PageHead
        title="Agreements"
        sub={
          counts && counts.length > 0
            ? counts.map((c) => `${c.label}: ${c.signed} of ${c.total} signed`).join(" · ")
            : "Agreements Edge8 signs with clients, employees, contractors and vendors."
        }
      />
      {typeof agreements === "string" ? (
        <div className="admin-card admin-section-card">
          <div className="admin-alert admin-alert--err">Agreements could not be read: {agreements}</div>
        </div>
      ) : (
        <AgreementCard
          heading="All agreements"
          agreements={agreements}
          may={mayProp(access, ["crm.agreements"])}
          prepare={{ kind: "team", members }}
          emptyText="No agreements yet. A client's agreement is prepared on its deal; an employee's or contractor's here."
        />
      )}
    </>
  );
}
