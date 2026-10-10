import { selectInquiries, selectLead } from "@/entities/crm/lib/reads";
import { ACTIVE_LEAD_STATUSES, NON_SALES_INQUIRY_TYPES } from "@/entities/crm/lib/lifecycle";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";
import { columnList, type Loaded } from "./shared";

// The two work queues on the Revenue overview: leads waiting on a reply, and
// contact-us inquiries waiting to be triaged.
//
// This was the one tab of the hub that queried and shaped in the route body
// while pipeline, billing, demand, market and data-health each awaited a named
// loader (A.19). Two raw PostgREST chains, a flatMap, an embed unwrap and the
// error strings sat in the page, so the query could only be read by opening a
// route, and no test could reach it without rendering one.
//
// NOTE ON THE HOUSE RULE: these are queues of people waiting on US, not metrics
// about people. Nothing here counts, scores, ranks or orders by who owns the
// row; the ordering is by how overdue the reply is. Adding a per-owner figure
// to this module would breach the rule in CLAUDE.md.

// How many of each the overview shows. The card links to the full queue, so
// this is a preview and not a page boundary that could change a total.
const PREVIEW = 8;

type LeadRow = {
  status: string | null;
  sla_due_at: string | null;
  created_at: string;
  people: Embedded<NamedPerson & { id: string; email: string }>;
};

// `archived_at` rides along inside the embed because the filter below reads it;
// it is not on the row type because nothing downstream looks at it.
const LEAD_COLUMNS = columnList<LeadRow>({
  status: "status",
  sla_due_at: "sla_due_at",
  created_at: "created_at",
  people: `people!person_id!inner(id, ${NAME_COLUMNS}, archived_at)`,
});

type InquiryRow = {
  id: string;
  subject: string | null;
  created_at: string;
  people: Embedded<NamedPerson>;
};

const INQUIRY_COLUMNS = columnList<InquiryRow>({
  id: "id",
  subject: "subject",
  created_at: "created_at",
  people: `people(${NAME_COLUMNS})`,
});

/** A lead awaiting a reply, flattened out of its embed. */
export type QueuedLead = {
  id: string;
  name: string;
  email: string;
  status: string | null;
  sla: string | null;
  created: string;
};

/** A contact-us inquiry awaiting triage. `name` is null when the row has no
 *  person attached at all, which the card renders as "Unknown". */
export type QueuedInquiry = {
  id: string;
  name: string | null;
  subject: string | null;
  created: string;
};

export type LeadQueue = Loaded & {
  leads: QueuedLead[];
  inquiries: QueuedInquiry[];
};

export async function loadLeadQueue(): Promise<LeadQueue> {
  const [leadsRes, inqRes] = await Promise.all([
    selectLead(LEAD_COLUMNS)
      .in("status", ACTIVE_LEAD_STATUSES)
      .is("people.archived_at", null)
      // The most overdue first, and a lead with no SLA sorts after the ones
      // that have one rather than ahead of them.
      .order("sla_due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(PREVIEW),
    selectInquiries(INQUIRY_COLUMNS)
      .eq("status", "new_lead")
      .not("type", "in", NON_SALES_INQUIRY_TYPES)
      .order("created_at", { ascending: false })
      .limit(PREVIEW),
  ]);

  // A failed read is said out loud on the card rather than rendering as an
  // empty queue, which would read as "nobody is waiting" (A.12).
  const errors = [
    ...(leadsRes.error ? [`lead queue: ${leadsRes.error.message}`] : []),
    ...(inqRes.error ? [`inquiries: ${inqRes.error.message}`] : []),
  ];

  const leads = ((leadsRes.data as unknown as LeadRow[] | null) ?? []).flatMap((l) => {
    const p = one(l.people);
    // The inner join should make this unreachable; the flatMap keeps it honest
    // rather than rendering a row with no name.
    return p
      ? [{ id: p.id, name: personName(p), email: p.email, status: l.status, sla: l.sla_due_at, created: l.created_at }]
      : [];
  });

  const inquiries = ((inqRes.data as unknown as InquiryRow[] | null) ?? []).map((q) => {
    const p = one(q.people);
    return { id: q.id, name: personName(p, null), subject: q.subject, created: q.created_at };
  });

  return { leads, inquiries, errors };
}
