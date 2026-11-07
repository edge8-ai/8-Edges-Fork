import { requirePermission } from "@/kernel/identity/access-request";
import { Suspense } from "react";
import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate, timeAgo } from "@/kernel/ui/format";
import { dealPath } from "@/kernel/config/slug";
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
import { RevenueTabs } from "./RevenueTabs";
import { TargetsCard } from "./TargetsCard";

export const metadata = {
  title: "Revenue overview",
  description: "The whole revenue engine on one screen: money, sales, marketing, and what each tab has to say.",
};

// The Revenue office landing (v2, 2026-09-13): one screen that says where the
// money is, what the sales queue needs, and what marketing is producing, with
// every tile a door into the tab or list behind it. The maths lives in
// lib/revenue-metrics/overview.ts and shares one dollar rule with every other
// tab, so this page and the Pipeline tab can no longer disagree.
export default async function RevenueOverviewPage() {
  await requirePermission("crm.pipeline");
  return (
    <>
      <PageHead eyebrow="Four Offices · Revenue" title="Revenue overview" sub="Money, the sales queue, marketing signals, and the company's targets, on one screen." />
      <RevenueTabs showRange={false} />
      <Suspense fallback={<DashSkeleton cards={4} />}>
        <OverviewSection />
      </Suspense>
    </>
  );
}

function Band({ label, note, muted }: { label: string; note?: string; muted?: boolean }) {
  return (
    <div className={`dash-band${muted ? " is-muted" : ""}`}>
      <span className="dash-band-label">{label}</span>
      {note && <span className="dash-band-note">{note}</span>}
    </div>
  );
}

async function OverviewSection() {
  const now = new Date();
  const nowIso = now.toISOString();
  const usd = (n: number) => compactUsd(n * 100);
  const [m, targets, queue, clientScore, workshopNps, audience, delivery, engine, meetingsBooked] = await Promise.all([
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
  const errors = [...m.errors, ...targets.errors, ...queue.errors, ...(workshopNps.error ? [workshopNps.error] : [])];
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

  return (
    <>
      <DashErrors errors={errors} />
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
        <ChartCard title="Deals needing attention" span={12} meta={`${m.needsAttention.length} open deals`} note="Every open deal is checked for the four things needed to act on it: an owner, a value, a next step and its date. Sorted by value, so the money at risk comes first." more={m.needsAttention.length > 10 ? { href: "/admin/revenue/deals?focus=no-next-step", label: `All ${m.needsAttention.length} on the deals board` } : undefined}>
          {m.needsAttention.length === 0 ? (
            <DashEmpty>Every open deal has an owner, a value, a next step and a date.</DashEmpty>
          ) : (
            <table className="dash-table dash-attn">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th className="n">Value</th>
                  <th>Missing</th>
                  <th>Current next step</th>
                </tr>
              </thead>
              <tbody>
                {m.needsAttention.slice(0, 10).map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={dealPath(d.title, d.id)}>{d.title}</Link>
                    </td>
                    <td>{d.stage}</td>
                    <td className="n">{d.usd ? usd(Math.round(d.usd / 100)) : "—"}</td>
                    <td>
                      <span className="dash-gaps">
                        {d.gaps.map((g) => (
                          <Badge key={g} tone="warn">
                            {g}
                          </Badge>
                        ))}
                      </span>
                    </td>
                    <td>
                      <span className="dash-clamp" title={d.nextStep ?? undefined}>{d.nextStep || "none set"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
