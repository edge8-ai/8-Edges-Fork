import { requirePermission } from "@/kernel/identity/access-request";
import { mayProp } from "@/kernel/identity/may-prop";
import { companyOs } from "@/kernel/data/supabase";
import { PageHead } from "@/kernel/ui/PageHead";
import { MetricCard } from "@/kernel/ui/MetricCard";
import { ACTIVE_LEAD_STATUSES } from "@/entities/crm/lib/lifecycle";
import { WEEKLY_MEETINGS_GOAL, getMeetingsBookedThisWeek } from "@/entities/crm/lib/lead-stats";
import { LeadQueue, type QueueRow } from "./LeadQueue";
import { triageForInquiries } from "@/entities/crm/lib/inquiry-triage-view";
import { one, type Embedded } from "@/kernel/config/embedded";
import { NAME_COLUMNS, type NamedPerson, personName } from "@/kernel/config/people-name";

export const metadata = {
  title: "Leads",
  description: "The SDR queue for qualifying inbound and booking meetings.",
};

// The SDR workstation. A queue, not a list: system-ordered (SLA first, then
// oldest promotion), worked top to bottom. Rows come from the lead satellite
// (one row per person being worked); nurture/unqualified leads leave the queue
// but stay on /admin/contacts; customers never appear here.

type LeadJoinRow = {
  status: string;
  sla_due_at: string | null;
  attempt_count: number;
  pinned_at: string | null;
  created_at: string;
  people: NamedPerson & {
    id: string;
    email: string;
    phone: string | null;
    source: string | null;
    archived_at: string | null;
    person_companies: { companies: Embedded<{ name: string | null }> }[] | null;
    person_qualifications: Embedded<{
      goal: string | null;
      plan: string | null;
      challenge: string | null;
      timeline: string | null;
      budget: string | null;
      authority: string | null;
    }>;
    inquiries: { id: string; subject: string | null; message: string | null; created_at: string; metadata: { team_size?: unknown } | null }[] | null;
  } | null;
};

function startOfDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function LeadsPage() {
  const access = await requirePermission("crm.pipeline");
  const nowIso = new Date().toISOString();

  const [queueRes, meetingsBooked, connectsRes] = await Promise.all([
    companyOs.from("lead").select(
        `status, sla_due_at, attempt_count, pinned_at, created_at, people!person_id!inner(id, ${NAME_COLUMNS}, phone, source, archived_at, person_companies(companies(name)), person_qualifications!person_id(goal, plan, challenge, timeline, budget, authority), inquiries(id, subject, message, created_at, metadata))`,
      )
      .in("status", ACTIVE_LEAD_STATUSES)
      .is("people.archived_at", null)
      // Pinned leads (manually boosted) sort to the top, most recently pinned
      // first; everyone else keeps the system SLA-first, then-oldest order.
      .order("pinned_at", { ascending: false, nullsFirst: false })
      .order("sla_due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(200),
    getMeetingsBookedThisWeek(),
    companyOs.from("lifecycle_transitions").select("id", { count: "exact", head: true })
      .eq("to_status", "connected")
      .gte("occurred_at", startOfDayIso()),
  ]);

  const leads = (((queueRes.data as unknown) as LeadJoinRow[] | null) ?? []).filter((l) => l.people);
  const latestOf = (l: LeadJoinRow) => (l.people!.inquiries ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  // The inquiry-to-lead chain's read of each lead's latest inquiry (Z.11). A
  // failed read leaves the cards without it and says so above the queue.
  const triage = await triageForInquiries(leads.map(latestOf).filter(Boolean).map((i) => i.id));

  const rows: QueueRow[] = leads
    .map((l) => {
      const p = l.people!;
      const qual = one(p.person_qualifications);
      const latestInquiry = latestOf(l);
      const teamSize = latestInquiry?.metadata?.team_size;
      return {
        id: p.id,
        name: personName(p),
        email: p.email,
        phone: p.phone,
        company: one(p.person_companies?.[0]?.companies ?? null)?.name ?? null,
        source: p.source,
        stage: "lead",
        status: l.status ?? "new",
        slaDueAt: l.sla_due_at,
        attemptCount: l.attempt_count ?? 0,
        pinnedAt: l.pinned_at,
        inquiry: latestInquiry
          ? {
              id: latestInquiry.id,
              subject: latestInquiry.subject,
              message: latestInquiry.message,
              createdAt: latestInquiry.created_at,
              teamSize: typeof teamSize === "string" && teamSize.trim() ? teamSize : null,
            }
          : null,
        qualifier: latestInquiry ? (triage.data.get(latestInquiry.id) ?? null) : null,
        qual: {
          goal: qual?.goal ?? "",
          plan: qual?.plan ?? "",
          challenge: qual?.challenge ?? "",
          timeline: qual?.timeline ?? "",
          budget: qual?.budget ?? "",
          authority: qual?.authority ?? "",
        },
      };
    });

  const connectsToday = connectsRes.count ?? 0;
  const slaOverdue = rows.filter((r) => r.slaDueAt && r.slaDueAt < nowIso).length;

  return (
    <>
      <PageHead
        eyebrow="Revenue"
        title="Leads"
        sub={`${rows.length} in the queue · worked top to bottom, SLA first`}
      />
      {queueRes.error && (
        <div className="admin-alert admin-alert--err u-mb-4">
          {queueRes.error.message}
        </div>
      )}
      {triage.error && <div className="admin-alert admin-alert--err u-mb-4">{triage.error}</div>}
      <div className="admin-kpi-grid u-mb-4">
        <MetricCard
          label="Meetings booked this week"
          value={`${meetingsBooked} / ${WEEKLY_MEETINGS_GOAL}`}
          sub="handed off to the closer"
        />
        <MetricCard label="Connects today" value={connectsToday} />
        <MetricCard label="Queue remaining" value={rows.length} />
        <MetricCard
          label="SLA overdue"
          value={slaOverdue}
          sub={slaOverdue > 0 ? "respond now" : "all inside SLA"}
        />
      </div>
      <LeadQueue rows={rows} may={mayProp(access, ["crm.pipeline"])} />
    </>
  );
}
