import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { InquiriesBoard, type InquiryCard } from "./InquiriesBoard";
import { one } from "@/kernel/config/embedded";
import { NON_SALES_INQUIRY_TYPES } from "@/entities/crm/lib/lifecycle";
import { heldInquiries, triageForInquiries } from "@/entities/crm/lib/inquiry-triage-view";
import { HeldStrip } from "./HeldStrip";

export const metadata = {
  title: "Inquiries",
  description: "Inbound inquiries from the website and forms.",
};

const ACTIVE_STATUSES = ["new_lead", "contacted", "qualified", "no_action"];

type EmbeddedPerson = { full_name: string | null; email: string; do_not_contact: boolean | null };
type Row = {
  id: string;
  type: string | null;
  subject: string | null;
  message: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
  deal_id: string | null;
  person_id: string | null;
  people: EmbeddedPerson | EmbeddedPerson[] | null;
};

export default async function InquiriesPage() {
  const access = await requirePermission("crm.pipeline");
  const may = mayProp(access, ["crm.pipeline"]);
  let query = companyOs.from("inquiries").select(
      "id, type, subject, message, source, status, created_at, deal_id, person_id, people(full_name, email, do_not_contact)",
    )
    .in("status", ACTIVE_STATUSES)
    .not("type", "in", NON_SALES_INQUIRY_TYPES)
    .order("created_at", { ascending: false })
    .limit(500);

  const { data, error } = await query;
  const rows = (data as Row[] | null) ?? [];
  // The inquiry-to-lead chain's read and run per card, and the inquiries it
  // holds as spam (Z.11). A failed read is said on the page; the board works
  // without it.
  const [triage, held] = await Promise.all([triageForInquiries(rows.map((r) => r.id)), heldInquiries()]);

  const cards: InquiryCard[] = rows.map((r) => {
    const p = one(r.people);
    return {
      id: r.id,
      columnId: r.status ?? "new_lead",
      type: r.type,
      subject: r.subject,
      message: r.message,
      source: r.source,
      created_at: r.created_at,
      deal_id: r.deal_id,
      personId: r.person_id,
      personName: p?.full_name ?? null,
      personEmail: p?.email ?? null,
      doNotContact: !!p?.do_not_contact,
      qualifier: triage.data.get(r.id) ?? null,
    };
  });

  const count = (fn: (c: InquiryCard) => boolean) => cards.filter(fn).length;
  const kpis = {
    fresh: count((c) => c.columnId === "new_lead"),
    contacted: count((c) => c.columnId === "contacted"),
    promoted: count((c) => c.columnId === "qualified"),
    noAction: count((c) => c.columnId === "no_action"),
  };

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Inquiries"
        sub={`${cards.length} open · contact-us intake, drag a card to change stage. The qualifier reads each one; sales inquiries go on to Leads, and every card it kept here says why.`}
      />
      {error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {error.message}
        </div>
      )}
      {triage.error && <div className="admin-alert admin-alert--err u-mb-4">{triage.error}</div>}
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard label="New" value={kpis.fresh} sub="unworked" />
        <MetricCard label="Contacted" value={kpis.contacted} />
        <MetricCard label="Promoted to lead" value={kpis.promoted} sub="in the SDR queue" />
        <MetricCard label="No action" value={kpis.noAction} />
      </div>
      <HeldStrip held={held.data} error={held.error} may={may} />
      <InquiriesBoard initialCards={cards} may={may} />
    </>
  );
}
