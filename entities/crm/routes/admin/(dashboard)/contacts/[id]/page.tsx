import { requirePermission } from "@/kernel/identity/access-request";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { notFound } from "next/navigation";
import { getPerson360 } from "@/entities/crm/lib/contacts";
import { getAffiliate360 } from "@/entities/crm/lib/affiliates";
import { getPortalMembershipsForPerson } from "@/entities/crm/lib/portal";
import { PersonTags } from "@/entities/crm/ui/PersonTags";
import { PortalMemberControls } from "@/entities/crm/ui/PortalMemberControls";
import { ContactAffiliatePanel } from "./ContactAffiliatePanel";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge, statusTone } from "@/kernel/ui/Badge";
import { ExternalLink } from "@/kernel/ui/ExternalLink";
import { Tabs, type TabDef } from "@/kernel/ui/Tabs";
import { PersonEditForm } from "./PersonEditForm";
import { PersonDangerZone } from "./PersonDangerZone";
import { PromoteButton } from "./PromoteButton";
import { CrmCommandBar } from "@/entities/crm/ui/CrmCommandBar";
import { ApplicantStatusSelect } from "@/entities/hiring/client";
import { getPersonHiring, proposeHrefsForIds, updateApplication } from "@/entities/hiring";
import { formatCents, formatDate, humanize, timeAgo } from "@/kernel/ui/format";
export const metadata = {
  title: "Contact",
  description: "Full relationship history and activity for one contact.",
};

const Empty = ({ text }: { text: string }) => <div className="admin-empty">{text}</div>;

export default async function ContactDetailPage(props: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("crm.contacts");
  const params = await props.params;
  // All key only on the person id, so one parallel wave; the ATS half is hiring's.
  const [data, portalMemberships, affiliate] = await Promise.all([
    getPersonHiring(params.id).then((hiring) => getPerson360(params.id, hiring)),
    getPortalMembershipsForPerson(params.id),
    getAffiliate360({ personId: params.id }),
  ]);
  if (!data) notFound();

  const { person, name, lead, candidateProfile, inquiries, deals, orders, bookings, applications, documents, surveyResponses, interactions, meetings, transitions, companies } = data;
  const isAffiliate = !!affiliate && affiliate.codes.length > 0;
  const membershipByCompany = new Map(
    portalMemberships.filter((m) => m.company_id).map((m) => [m.company_id as string, m]),
  );
  const isCustomer = deals.some((d) => d.status === "won");
  // Applicants are recruited, not sold to: for a job seeker we replace the
  // "Promote to lead" sales action with a status control on their most recent
  // application (applications come back newest-first from getPerson360).
  const isApplicant = person.persona === "job_seeker";
  const latestApplication = applications[0] ?? null;
  const primaryCompany = companies.find((c) => c.is_primary) ?? companies[0] ?? null;
  const location = [person.city, person.state_province, person.country].filter(Boolean).join(", ");

  // One merged activity stream: interactions, meetings, and lifecycle
  // transitions, newest first. This is the relationship history in one place.
  type ActivityItem = { key: string; at: string; title: string; sub: string; badge?: string };
  const activity: ActivityItem[] = [
    ...interactions.map((i) => ({
      key: `i-${i.id}`,
      at: i.occurred_at ?? i.created_at,
      title: i.subject || humanize(i.kind) || "Interaction",
      sub: i.body ? (i.body.length > 140 ? `${i.body.slice(0, 140)}…` : i.body) : humanize(i.kind),
      badge: humanize(i.kind ?? "note"),
    })),
    ...meetings.map((m) => ({
      key: `m-${m.id}`,
      at: m.started_at ?? "",
      title: m.title || "Meeting",
      sub: [humanize(m.meeting_type), m.source ? `via ${m.source}` : null].filter(Boolean).join(" · "),
      badge: "Meeting",
    })),
    ...transitions.map((t) => ({
      key: `t-${t.id}`,
      at: t.occurred_at,
      title: `Lifecycle: ${humanize(t.from_stage ?? "—")} → ${humanize(t.to_stage ?? "—")}`,
      sub: [
        t.from_status || t.to_status
          ? `${humanize(t.from_status ?? "—")} → ${humanize(t.to_status ?? "—")}`
          : null,
        t.reason ? humanize(t.reason) : null,
        t.note,
      ]
        .filter(Boolean)
        .join(" · "),
      badge: "Stage change",
    })),
  ]
    .filter((a) => a.at)
    .sort((a, b) => b.at.localeCompare(a.at));

  const tabs: TabDef[] = [
    {
      key: "activity",
      label: "Activity",
      count: activity.length,
      content: activity.length === 0 ? (
        <Empty text="No activity yet." />
      ) : (
        <div className="admin-list">
          {activity.map((a) => (
            <div className="admin-list-row" key={a.key}>
              <div className="admin-list-main">
                <div className="admin-list-title">{a.title}</div>
                <div className="admin-list-sub">{a.sub || "—"}</div>
              </div>
              <div className="admin-list-aside">
                {a.badge && <Badge>{a.badge}</Badge>}
                <span className="admin-cell-muted">{timeAgo(a.at)}</span>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "inquiries",
      label: "Inquiries",
      count: inquiries.length,
      content: inquiries.length === 0 ? (
        <Empty text="No inquiries." />
      ) : (
        <div className="admin-list">
          {inquiries.map((iq) => (
            <div className="admin-list-row" key={iq.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{iq.subject || humanize(iq.type)}</div>
                <div className="admin-list-sub">
                  {humanize(iq.type)} · {iq.source || "—"} · {timeAgo(iq.created_at)}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={statusTone(iq.status)}>{humanize(iq.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "deals",
      label: "Deals",
      count: deals.length,
      content: deals.length === 0 ? (
        <Empty text="No deals." />
      ) : (
        <div className="admin-list">
          {deals.map((d) => (
            <div className="admin-list-row" key={d.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{d.title || "Untitled deal"}</div>
                <div className="admin-list-sub">{timeAgo(d.created_at)}</div>
              </div>
              <div className="admin-list-aside">
                <strong className="admin-cell-mono">{formatCents(d.amount_usd_cents, "usd")}</strong>
                <Badge tone={statusTone(d.status)}>{humanize(d.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "orders",
      label: "Orders",
      count: orders.length,
      content: orders.length === 0 ? (
        <Empty text="No orders." />
      ) : (
        <div className="admin-list">
          {orders.map((o) => (
            <div className="admin-list-row" key={o.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{formatCents(o.amount_usd_cents, "usd")}</div>
                <div className="admin-list-sub">
                  {humanize(o.payment_method)} · {formatDate(o.created_at)}
                </div>
              </div>
              <div className="admin-list-aside">
                <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "bookings",
      label: "AIO Pad",
      count: bookings.length,
      content: bookings.length === 0 ? (
        <Empty text="No bookings." />
      ) : (
        <div className="admin-list">
          {bookings.map((b) => (
            <div className="admin-list-row" key={b.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{humanize(b.kind)}</div>
                <div className="admin-list-sub">
                  {formatDate(b.start_date)} → {formatDate(b.end_date)}
                  {b.party_size ? ` · party of ${b.party_size}` : ""}
                </div>
              </div>
              <div className="admin-list-aside">
                <strong className="admin-cell-mono">{formatCents(b.amount_usd_cents, "usd")}</strong>
                <Badge tone={statusTone(b.status)}>{humanize(b.status)}</Badge>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "recruiting",
      label: "Recruiting",
      count: applications.length,
      content: applications.length === 0 && !candidateProfile?.headline && !candidateProfile?.do_not_hire ? (
        <Empty text="No applications." />
      ) : (
        <div>
          {(candidateProfile?.headline || candidateProfile?.do_not_hire) && (
            <div className="admin-list-row">
              <div className="admin-list-main">
                <div className="admin-list-title">{candidateProfile?.headline || candidateProfile?.current_title || "Applicant"}</div>
                <div className="admin-list-sub">
                  <ExternalLink href={person.linkedin_url} fallback="—">
                    LinkedIn
                  </ExternalLink>
                </div>
              </div>
              {candidateProfile?.do_not_hire && (
                <div className="admin-list-aside">
                  <Badge tone="err">Do not hire</Badge>
                </div>
              )}
            </div>
          )}
          {applications.length === 0 ? (
            <Empty text="No applications." />
          ) : (
            <div className="admin-list u-mt-2">
              {applications.map((a) => (
                <div className="admin-list-row" key={a.id}>
                  <div className="admin-list-main">
                    <div className="admin-list-title">{a.job_title || "Application"}</div>
                    <div className="admin-list-sub">
                      Applied {formatDate(a.applied_at ?? a.created_at)}
                      {a.rating ? ` · ★ ${a.rating}` : ""}
                      {/* A résumé is recruiting data: the link shows to whoever may open it (hiring.ats). */}
                      {a.resume_document_id && access.may("hiring.ats") ? (
                        <>
                          {" · "}
                          <a href={`/admin/talent/resume/${a.resume_document_id}`} target="_blank" rel="noreferrer">
                            Resume ↗
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="admin-list-aside">
                    <Badge tone={statusTone(a.status)}>{humanize(a.status)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "documents",
      label: "Documents",
      count: documents.length,
      content: documents.length === 0 ? (
        <Empty text="No documents." />
      ) : (
        <div className="admin-list">
          {documents.map((doc) => (
            <div className="admin-list-row" key={doc.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">{doc.title || "Document"}</div>
                <div className="admin-list-sub">
                  {doc.mime_type || "—"} · {formatDate(doc.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "surveys",
      label: "Surveys",
      count: surveyResponses.length,
      content: surveyResponses.length === 0 ? (
        <Empty text="No survey responses." />
      ) : (
        <div className="admin-list">
          {surveyResponses.map((s) => (
            <div className="admin-list-row" key={s.id}>
              <div className="admin-list-main">
                <div className="admin-list-title">Survey response</div>
                <div className="admin-list-sub">{formatDate(s.submitted_at ?? s.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHead
        eyebrow={<Link href="/admin/contacts">← Contacts</Link>}
        title={name}
        sub={person.email}
        action={
          <div className="u-stack u-items-end" /* layout-ok: no cross-axis end utility (needs .u-items-end) */>
            <span className="u-row u-wrap">
              {person.archived_at && <Badge tone="neutral">Archived</Badge>}
              {person.do_not_contact && <Badge tone="err">Do not contact</Badge>}
              {person.is_team_member && <Badge tone="info">Team</Badge>}
              {isCustomer && <Badge tone="ok">Customer</Badge>}
              {!isCustomer && lead && (
                <Badge tone="info">Lead · {humanize(lead.status)}</Badge>
              )}
              {person.persona && <Badge>{humanize(person.persona)}</Badge>}
              {isApplicant && latestApplication && (
                <ApplicantStatusSelect
                  applicationId={latestApplication.id}
                  status={latestApplication.status}
                  label="Applicant status"
                  save={updateApplication} /* Z.9: a live hiring chain proposes Hired and Rejected */ proposeHref={(await proposeHrefsForIds([latestApplication.id])).get(latestApplication.id) ?? null}
                />
              )}
              {!isApplicant &&
                !person.do_not_contact &&
                !person.is_team_member &&
                !isCustomer &&
                (!lead || ["unqualified", "nurture"].includes(lead.status)) && (
                  <PromoteButton personId={person.id} />
                )}
            </span>
            <CrmCommandBar
              kind="contact"
              id={person.id}
              name={name}
              archived={!!person.archived_at}
              assumeCompanyId={primaryCompany?.company_id ?? null}
            />
          </div>
        }
      />

      <div className="admin-360">
        <div>
          <div className="admin-card admin-section-card">
            <PersonEditForm person={person} />
          </div>
          <div className="admin-card admin-section-card">
            <dl className="admin-kv">
              <dt>Email</dt>
              <dd>{person.email}</dd>
              <dt>Company</dt>
              <dd>
                {primaryCompany ? (
                  <Link href={`/admin/revenue/companies/${primaryCompany.company_id}`}>
                    {primaryCompany.name || "—"}
                  </Link>
                ) : (
                  "—"
                )}
                {primaryCompany?.title ? ` · ${primaryCompany.title}` : ""}
              </dd>
              <dt>Location</dt>
              <dd>{location || "—"}</dd>
              <dt>Timezone</dt>
              <dd>{person.timezone || "—"}</dd>
              <dt>Source</dt>
              <dd>{person.source || "—"}</dd>
              <dt>Added</dt>
              <dd>{formatDate(person.created_at)}</dd>
            </dl>
          </div>
          <PersonTags personId={person.id} />
        </div>

        {/* Main column carries the relationship content so its height matches the
            sidebar: Activity, then the affiliate panel, then portal + danger. */}
        <div>
          <div className="admin-card admin-section-card">
            <Tabs tabs={tabs} />
          </div>

          {isAffiliate && affiliate && <ContactAffiliatePanel affiliate={affiliate} />}

          {!person.is_team_member && companies.length > 0 && (
            <div className="admin-card admin-section-card">
              <h2 className="admin-card-title">Client portal</h2>
              <div className="admin-list">
                {companies.map((c) => (
                  <div className="admin-list-row" key={c.company_id}>
                    <div className="admin-list-main">
                      <div className="admin-list-title">{c.name || "—"}</div>
                    </div>
                    <div className="admin-list-aside">
                      <PortalMemberControls
                        personId={person.id}
                        companyId={c.company_id}
                        active={membershipByCompany.get(c.company_id)?.status === "active"}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="admin-card admin-section-card">
            <PersonDangerZone
              personId={person.id}
              personName={name}
            />
          </div>
        </div>
      </div>
    </>
  );
}
