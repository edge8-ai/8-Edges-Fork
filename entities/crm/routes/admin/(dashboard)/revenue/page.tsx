import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, timeAgo } from "@/kernel/ui/format";
import { ChartCard, DashEmpty, DashErrors, DashSkeleton, StatTile } from "@/kernel/ui/dash/StatTile";
import { Columns } from "@/kernel/ui/dash/Columns";
import { HBars } from "@/kernel/ui/dash/HBars";
import { DonutChart } from "@/kernel/ui/charts/DonutChart";
// The overview frames CRM numbers with company-os's compaction and site
// analytics, the org survey score, and the campaigns entity's marketing
// figures. Each comes through its entity's door.
import { compactUsd, getAnalyticsOverview } from "@/entities/company-os";
import { getSurveyNps, getSurveyScore } from "@/entities/org";
import { getAudienceBreakdown, getDeliverability, getContentEngine } from "@/entities/campaigns";
import { WEEKLY_MEETINGS_GOAL, getMeetingsBookedThisWeek } from "@/entities/crm/lib/lead-stats";
import { loadOverview } from "@/entities/crm/lib/revenue-metrics/overview";
import { loadLeadQueue } from "@/entities/crm/lib/revenue-metrics/lead-queue";
import { loadTargets, periodLabelOf, periodProgress, periodStart, targetFor, MONEY_METRICS, PERIOD_KINDS, TARGET_LABELS, TARGET_METRICS, type PeriodKind } from "@/entities/crm/lib/revenue-metrics/targets";
import { mayProp, type MayProp } from "@/kernel/identity/may-prop";
import { businessDate } from "@/kernel/config/dates";
import { approveMessage, cancelMessage, messagesAwaitingApproval } from "@/entities/campaigns";
import { logFollowUp } from "@/entities/crm/lib/follow-up-actions";
import { CloseDealsList } from "@/entities/crm/ui/CloseDealsList";
import { EmailsToApprove } from "@/entities/crm/ui/EmailsToApprove";
import { EMAIL_DRAFT_ATOMS, emailDraftsFor } from "@/entities/crm/lib/revenue-today";
import { moveDealStage } from "./deals/actions";
import { RevenueTabs } from "./RevenueTabs";
import { TargetsCard } from "./TargetsCard";

export const metadata = {
  title: "Revenue today",
  description: "Deals to close and personal emails to approve first, then lead gen, marketing and money, then the numbers.",
};

const DEALS_SHOWN = 8;

// The Revenue office landing (v2, 2026-09-13): one screen that says where the
// money is, what the sales queue needs, and what marketing is producing, with
// every tile a door into the tab or list behind it. The maths lives in
// lib/revenue-metrics/overview.ts and shares one dollar rule with every other
// tab, so this page and the Pipeline tab can no longer disagree.
//
// Revenue today (RT.1, 2026-11-13): the page now opens on what moves revenue,
// in Dave's order. First the open deals that need a move, closest to signing,
// with the moves that close them; then the personal emails waiting for his
// yes; then, quieter, lead gen, inquiries, marketing and money. The numbers
// that used to open the page follow, unchanged.
export default async function RevenueOverviewPage() {
  const access = await requirePermission("crm.pipeline");
  return (
    <>
      <PageHead eyebrow="Four Offices · Revenue" title="Revenue today" sub="Close deals and send the right email first. The numbers are below." />
      <RevenueTabs showRange={false} />
      <Suspense fallback={<DashSkeleton cards={4} />}>
        <OverviewSection may={mayProp(access, ["crm.pipeline", ...EMAIL_DRAFT_ATOMS])} />
      </Suspense>
    </>
  );
}

/** A draft's first words, on one line: enough to know which email it is. */
function previewOf(body: string): string {
  const one = body.split(/\s+/).join(" ").trim();
  return one.length > 160 ? `${one.slice(0, 159)}…` : one;
}

function Band({ label, note, muted }: { label: string; note?: string; muted?: boolean }) {
  return (
    <div className={`dash-band${muted ? " is-muted" : ""}`}>
      <span className="dash-band-label">{label}</span>
      {note && <span className="dash-band-note">{note}</span>}
    </div>
  );
}

async function OverviewSection({ may }: { may: MayProp }) {
  const now = new Date();
  const nowIso = now.toISOString();
  const usd = (n: number) => compactUsd(n * 100);
  const [emails, m, targets, queue, clientScore, workshopNps, audience, delivery, engine, meetingsBooked] = await Promise.all([
    emailDraftsFor(may, () => messagesAwaitingApproval()),
    loadOverview(now),
    loadTargets(),
    loadLeadQueue(),
    getSurveyScore("ai-capability-pulse"),
    getSurveyNps("ai-journey-feedback"),
    getAudienceBreakdown(),
    getDeliverability("30d"),
    getContentEngine(),
    getMeetingsBookedThisWeek(),
  ]);
  const errors = [...(emails?.error ? [`personal emails: ${emails.error}`] : []), ...m.errors, ...targets.errors, ...queue.errors, ...(workshopNps.error ? [workshopNps.error] : [])];
  const { leads, inquiries } = queue;
  const wonTarget = targetFor(targets.rows, "won_usd", "year", now);
  // Every period the card can edit, each with its own amounts, so the switch
  // shows the quarter's figures rather than the month's (RF-6).
  const targetPeriods = PERIOD_KINDS.map((kind: PeriodKind) => ({
    kind,
    label: periodLabelOf(kind, now),
    rows: TARGET_METRICS.map((metric) => {
      const row = targetFor(targets.rows, metric, kind, now);
      return { metric, label: TARGET_LABELS[metric], money: MONEY_METRICS.has(metric), periodKind: kind, periodStart: periodStart(kind, now), amount: row?.amount ?? null, note: row?.note ?? null };
    }),
  }));
  const thisMonthRevenue = m.revenueByMonth[m.revenueByMonth.length - 1];

  const today = businessDate(now);
  const closeWorth = m.toClose.reduce((n, d) => n + (d.usd ?? 0), 0);
  const waiting = emails?.total ?? 0;
  const sentence = [
    m.toClose.length > 0 ? `${m.toClose.length} ${m.toClose.length === 1 ? "deal" : "deals"} to move toward close${closeWorth > 0 ? `, worth $${closeWorth.toLocaleString("en-US")}` : ""}.` : "Every open deal has a dated next step ahead.",
    emails ? (waiting > 0 ? `${waiting} personal ${waiting === 1 ? "email waits" : "emails wait"} for your yes.` : "No personal email is waiting.") : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <DashErrors errors={errors} />
      <p className="rt-sentence">{sentence}</p>

      <section className="admin-card admin-section-card admin-home-first" aria-labelledby="rt-close-h">
        <div className="admin-card-head">
          <h2 className="admin-card-title" id="rt-close-h">
            Close these deals <span className="admin-home-note">closest to signing first, then biggest</span>
          </h2>
          <Link href="/admin/revenue/deals" className="admin-auth-link">
            Deals →
          </Link>
        </div>
        <CloseDealsList deals={m.toClose.slice(0, DEALS_SHOWN)} actions={{ logFollowUp, moveDealStage }} today={today} wonStageId={m.wonStageId} lostStageId={m.lostStageId} may={may} />
        <p className="admin-list-sub admin-home-more">
          {[m.toClose.length > DEALS_SHOWN ? `${m.toClose.length - DEALS_SHOWN} more to move on the Deals page` : null, `${m.onTrack} open ${m.onTrack === 1 ? "deal" : "deals"} on track`, `pipeline ${usd(m.openPipeline)}, ${usd(m.openWeighted)} weighted`].filter(Boolean).join(" · ")}
        </p>
      </section>

      {emails && (
        <section className="admin-card admin-section-card" aria-labelledby="rt-email-h">
          <div className="admin-card-head">
            <h2 className="admin-card-title" id="rt-email-h">
              Personal emails to approve <span className="admin-home-note">nothing sends without your yes</span>
            </h2>
            <Link href="/admin/revenue/marketing/recurring" className="admin-auth-link">
              Email agents →
            </Link>
          </div>
          <EmailsToApprove
            emails={emails.rows.map((e) => ({ id: e.id, agentId: e.agentId, agentName: e.agentName, recipient: e.recipientName, subject: e.subject, preview: previewOf(e.bodyMd), held: e.status === "held" ? e.holdReason : null }))}
            actions={{ approve: approveMessage, skip: cancelMessage }}
            may={may}
          />
          {waiting > emails.rows.length && <p className="admin-list-sub admin-home-more">{waiting - emails.rows.length} more in the agents&rsquo; queues.</p>}
        </section>
      )}

      <div className="rt-also">
        <Link href="/admin/revenue/leads" className="admin-card rt-also-card">
          <span className="admin-list-sub">Lead gen</span>
          <strong>{m.slaOverdue > 0 ? `${m.slaOverdue} leads past reply time` : "Every lead answered in time"}</strong>
          <span className="admin-list-sub">
            {m.newLeads30.value} new in 30 days · {meetingsBooked} of {WEEKLY_MEETINGS_GOAL} meetings booked this week
          </span>
        </Link>
        <Link href="/admin/revenue/inquiries" className="admin-card rt-also-card">
          <span className="admin-list-sub">Inquiries</span>
          <strong>{inquiries.length > 0 ? `${inquiries.length} to triage` : "Nothing to triage"}</strong>
          <span className="admin-list-sub">The inquiries board</span>
        </Link>
        <Link href="/admin/revenue/marketing/campaigns" className="admin-card rt-also-card">
          <span className="admin-list-sub">Marketing</span>
          <strong>{audience.eligible.toLocaleString("en-US")} can get the newsletter</strong>
          <span className="admin-list-sub">{engine.activeCampaigns.length} active campaigns</span>
        </Link>
        <Link href="/admin/revenue/billing" className="admin-card rt-also-card">
          <span className="admin-list-sub">Money</span>
          <strong>{usd(m.arOutstanding)} waiting to be paid</strong>
          <span className="admin-list-sub">
            {thisMonthRevenue ? `${usd(thisMonthRevenue.usd)} this month · ` : ""}
            {usd(m.revenueYtd)} this year
          </span>
        </Link>
      </div>

      <Band label="The numbers" />
      <div className="dash-grid">
        <StatTile label="Revenue · last 12 months" value={usd(m.revenue12m.value)} sub="invoices by date plus paid Stripe orders" delta={{ ...m.revenue12m, format: "usd", priorLabel: "the 12 months before" }} href="/admin/revenue/billing" />
        <StatTile label={`Revenue · ${now.getUTCFullYear()} to date`} value={usd(m.revenueYtd)} sub={m.revenueYtdByEntity.map((e) => `${e.entity} ${usd(e.usd)}`).join(" · ")} href="/admin/revenue/billing" />
        <StatTile
          label="Won · year to date"
          value={usd(m.wonYtd)}
          raw={m.wonYtd}
          sub={`closed deal value, ${now.getUTCFullYear()}`}
          target={wonTarget ? { amount: wonTarget.amount, format: "usd", progress: periodProgress("year", now), label: `${periodLabelOf("year", now)} target` } : undefined}
          href="/admin/revenue/pipeline"
        />
        <StatTile label="Receivable outstanding" value={usd(m.arOutstanding)} sub="open and overdue invoices" href="/admin/revenue/invoices?status=overdue" />
      </div>

      <Band label="Sales" note={[m.needsAttention.length > 0 ? `${m.needsAttention.length} deals need attention` : "pipeline clean", m.slaOverdue > 0 ? `${m.slaOverdue} lead SLAs overdue` : null].filter(Boolean).join(" · ")} />
      <div className="dash-grid">
        <StatTile label="Open pipeline" value={usd(m.openPipeline)} sub={`${m.openCount} open deals · ${usd(m.openWeighted)} weighted`} href="/admin/revenue/pipeline" />
        <StatTile label="New leads · 30 days" value={m.newLeads30.value} delta={{ ...m.newLeads30, priorLabel: "prior 30 days" }} href="/admin/revenue/leads" />
        <StatTile label="Meetings booked" value={`${meetingsBooked} / ${WEEKLY_MEETINGS_GOAL}`} sub="this week, against the weekly goal" href="/admin/revenue/meetings" />
        <StatTile label="Lead to won · 90 days" value={m.conversion90 == null ? "—" : `${m.conversion90}%`} sub="won deals closed in the window over leads created in it" href="/admin/revenue/pipeline" />
      </div>
      <div className="dash-grid">
        <ChartCard title={`Revenue by month · ${now.getUTCFullYear()}`} meta={thisMonthRevenue ? `${usd(thisMonthRevenue.usd)} this month so far` : undefined} note="Invoices by transaction month plus paid Stripe orders. The recurring series is what the QuickBooks sync classified as a retainer or subscription.">
          <Columns
            labels={m.revenueByMonth.map((p) => p.label)}
            series={[
              { name: "total", values: m.revenueByMonth.map((p) => p.usd) },
              { name: "recurring", values: m.revenueByMonth.map((p) => p.recurring), tone: "ok" },
            ]}
            format="usd"
            emptyText="No revenue recorded this year."
          />
        </ChartCard>
        <ChartCard title="Pipeline flow · last 30 days" note="Inquiries that arrived, leads promoted, deals opened and deals won in the window. Volumes of work, not of anyone's activity." more={{ href: "/admin/revenue/demand", label: "Demand tab" }}>
          <HBars rows={m.funnel30} showTrack emptyText="No pipeline activity in the last 30 days." />
        </ChartCard>
        <ChartCard title="Leads to work" meta={leads.length ? `${leads.length} shown` : undefined} more={{ href: "/admin/revenue/leads", label: "The whole queue" }}>
          {leads.length === 0 ? (
            <DashEmpty>No current leads in the queue.</DashEmpty>
          ) : (
            <div className="dash-list">
              {leads.map((l) => {
                const overdue = !!l.sla && l.sla < nowIso;
                return (
                  <div key={l.id} className="dash-list-row">
                    <div className="dash-list-main">
                      <div className="dash-list-title">
                        <Link href={`/admin/contacts/${l.id}`}>{l.name}</Link>
                      </div>
                      <div className="dash-list-sub">{l.email}</div>
                    </div>
                    <div className="dash-list-aside">
                      <Badge tone={overdue ? "err" : "info"} dot>
                        {l.status ?? "new"}
                      </Badge>
                      <span>{l.sla ? `SLA ${overdue ? "overdue" : formatDate(l.sla)}` : `added ${timeAgo(l.created)}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
        <ChartCard title="Inquiries to triage" more={{ href: "/admin/revenue/inquiries", label: "The inquiries board" }}>
          {inquiries.length === 0 ? (
            <DashEmpty>No new contact-us inquiries. Inbox zero.</DashEmpty>
          ) : (
            <div className="dash-list">
              {inquiries.map((q) => (
                <div key={q.id} className="dash-list-row">
                  <div className="dash-list-main">
                    <div className="dash-list-title">{q.name || "Unknown"}</div>
                    <div className="dash-list-sub">{q.subject || "Contact-us inquiry"}</div>
                  </div>
                  <div className="dash-list-aside">{timeAgo(q.created)}</div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <Band label="Marketing" note={`${audience.eligible.toLocaleString("en-US")} newsletter-eligible contacts`} />
      <Suspense fallback={<DashSkeleton cards={2} />}>
        <MarketingSection audience={audience} openedEmails={delivery.opened} openRate={delivery.openRate} activeCampaigns={engine.activeCampaigns.map((c) => ({ id: c.id, title: c.name, status: String(c.status) }))} />
      </Suspense>

      <Band label="Targets" note="month, quarter and year" />
      <div className="dash-grid">
        <TargetsCard periods={targetPeriods} />
      </div>

      {/* Two client scores, kept apart because they measure different things:
          the live workshops feed lead generation, the AI Capability Pulse
          follows online-program learners (Dave, 2026-10-05). */}
      <Band label="Feedback" />
      <div className="dash-grid">
        <StatTile label="Workshop NPS" value={workshopNps.nps == null ? "—" : workshopNps.nps > 0 ? `+${workshopNps.nps}` : workshopNps.nps} sub={workshopNps.responses > 0 ? `Workshop Feedback · ${workshopNps.responses} responses` : "no responses yet"} />
        <StatTile label="Learner capability score" value={clientScore.avg != null ? `${clientScore.avg} / ${clientScore.scale}` : "—"} sub={clientScore.responses > 0 ? `AI Capability Pulse · ${clientScore.responses} responses` : "coming later"} />
      </div>

      <Band label="Customer success" note="coming later" muted />
      <div className="dash-grid u-dim">
        <StatTile label="Active clients" value="—" sub="coming later" />
        <StatTile label="Renewals due" value="—" sub="coming later" />
        <StatTile label="At-risk accounts" value="—" sub="coming later" />
      </div>
    </>
  );
}

// The Marketing band leans on the external Vercel Analytics API, so it streams
// in its own boundary rather than gating the database-backed sections above.
async function MarketingSection({ audience, openedEmails, openRate, activeCampaigns }: { audience: { total: number; eligible: number }; openedEmails: number; openRate: number | null; activeCampaigns: { id: string; title: string | null; status: string | null }[] }) {
  const analytics = await getAnalyticsOverview("30d", "public");
  const visitors = "error" in analytics ? null : analytics.totals.visitors;
  const byChannel = "error" in analytics ? [] : analytics.byChannel;
  return (
    <>
      <div className="dash-grid">
        <StatTile label="Visitors · 30 days" value={visitors != null ? visitors.toLocaleString("en-US") : "—"} sub="unique, public site" href="/admin/revenue/marketing" />
        <StatTile label="Newsletter audience" value={audience.eligible.toLocaleString("en-US")} sub={`of ${audience.total.toLocaleString("en-US")} contacts`} href="/admin/revenue/marketing" />
        <StatTile label="Emails opened · 30 days" value={openedEmails.toLocaleString("en-US")} sub={openRate != null ? `${openRate.toFixed(0)}% open rate` : "no email activity yet"} href="/admin/revenue/marketing" />
        <StatTile label="Active campaigns" value={activeCampaigns.length} sub="in flight" href="/admin/revenue/marketing/campaigns" />
      </div>
      <div className="dash-grid">
        <ChartCard title="Traffic by channel · 30 days">
          <DonutChart data={byChannel} centerLabel="visits" ariaLabel="Public site traffic by channel" emptyText="No traffic data." />
        </ChartCard>
        <ChartCard title="Active campaigns" more={{ href: "/admin/revenue/marketing/campaigns", label: "All campaigns" }}>
          {activeCampaigns.length === 0 ? (
            <DashEmpty>Nothing in flight.</DashEmpty>
          ) : (
            <div className="dash-list">
              {activeCampaigns.slice(0, 6).map((c) => (
                <div key={c.id} className="dash-list-row">
                  <div className="dash-list-main">
                    <div className="dash-list-title">
                      <Link href={`/admin/revenue/marketing/campaigns/${c.id}`}>{c.title || "Untitled campaign"}</Link>
                    </div>
                  </div>
                  <div className="dash-list-aside">{(c.status ?? "").replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </>
  );
}
