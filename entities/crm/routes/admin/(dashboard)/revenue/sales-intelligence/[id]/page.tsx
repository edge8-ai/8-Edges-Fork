import { SurfaceLink as Link } from "@/kernel/shell/SurfaceLink";
import { notFound } from "next/navigation";
import { requirePermission } from "@/kernel/identity/access-request";
import { getCall, scorecardAverage } from "@/entities/crm/lib/calls";
import { analyzeCall, isHostSpeaker } from "@/entities/crm/lib/call-analysis";
import { PageHead } from "@/kernel/ui/PageHead";
import { renderPlanMarkdown } from "@/kernel/ui/plan-markdown";
import { formatDate } from "@/kernel/ui/format";
import { larkMinutesUrl } from "@/kernel/config/lark";

export const metadata = {
  title: "Sales Intelligence",
};

const DIMENSIONS: { key: "scoreTalkRatio" | "scorePainQuantified" | "scoreProductFit" | "scoreObjectionSurfaced" | "scoreNextStep"; label: string }[] = [
  { key: "scoreTalkRatio", label: "Talked less than the prospect" },
  { key: "scorePainQuantified", label: "Pain quantified in dollars" },
  { key: "scoreProductFit", label: "Right-product fit confirmed" },
  { key: "scoreObjectionSurfaced", label: "Real objection surfaced live" },
  { key: "scoreNextStep", label: "Next step on the calendar" },
];

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

// Details page: one call. The header stats (talk ratio, questions) are computed
// live from the transcript; the five-dimension scorecard comes from the weekly
// scoring pass and is null until the call is scored.
export default async function CallDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requirePermission("crm.calls");
  const call = await getCall(params.id);
  if (!call) notFound();

  const stats = analyzeCall(call.transcript);
  const avg = scorecardAverage(call.scorecard);
  const coachingHtml = call.scorecard?.coachingMd ? await renderPlanMarkdown(call.scorecard.coachingMd) : null;

  return (
    <div className="admin-content">
      <div className="u-mb-3">
        <Link className="admin-cell-muted" href="/admin/revenue/sales-intelligence">
          ← All calls
        </Link>
      </div>

      <PageHead
        eyebrow="Revenue · Sales Intelligence"
        title={call.title}
        sub={`${call.startedAt ? formatDate(call.startedAt) : "Date unknown"} · ${fmtDuration(call.durationSeconds)} · ${call.callType}`}
        action={
          call.minuteToken && larkMinutesUrl(call.minuteToken) ? (
            <a
              className="admin-btn"
              href={larkMinutesUrl(call.minuteToken) as string}
              target="_blank"
              rel="noreferrer"
            >
              Open in Lark
            </a>
          ) : undefined
        }
      />

      <div className="admin-kpi-grid u-mb-4">
        <div className="admin-kpi">
          <div className="admin-kpi-label">Your talk ratio</div>
          <div className="admin-kpi-val">{stats.talkRatio == null ? "—" : `${Math.round(stats.talkRatio * 100)}%`}</div>
          <div className="admin-kpi-note">target under 45%</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Questions you asked</div>
          <div className="admin-kpi-val">{stats.questionCount}</div>
          <div className="admin-kpi-note">target 15+ on discovery</div>
        </div>
        <div className="admin-kpi">
          <div className="admin-kpi-label">Coach score</div>
          <div className="admin-kpi-val">{avg == null ? "—" : `${avg.toFixed(1)} / 5`}</div>
          <div className="admin-kpi-note">{call.scorecard ? `scored ${formatDate(call.scorecard.scoredAt)}` : "not scored yet"}</div>
        </div>
      </div>

      {call.scorecard && (
        <div className="admin-card admin-section-card u-mb-4">
          <div className="admin-shelf-heading u-mb-2">Scorecard</div>
          <table className="admin-table u-w-full">
            <tbody>
              {DIMENSIONS.map((d) => {
                const v = call.scorecard![d.key];
                return (
                  <tr key={d.key}>
                    <td>{d.label}</td>
                    <td className="u-right u-nowrap">
                      {v == null ? (
                        <span className="admin-cell-muted">—</span>
                      ) : (
                        <span className={`admin-badge ${v >= 4 ? "admin-badge--ok" : v >= 3 ? "admin-badge--warn" : "admin-badge--err"}`}>
                          {v} / 5
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {coachingHtml && (
            <div className="u-mt-3">
              <div className="admin-shelf-heading u-mb-2">Coaching notes</div>
              <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: coachingHtml }} />
            </div>
          )}
        </div>
      )}

      <div className="admin-card admin-section-card u-mb-4">
        <div className="admin-shelf-heading u-mb-2">Who talked</div>
        {stats.speakers.map((s) => (
          <div key={s.name} className="u-row u-gap-3 u-mb-2">
            <div className={`${isHostSpeaker(s.name) ? "admin-cell-strong" : undefined} u-w-160`}>
              {s.name}
            </div>
            <div className="admin-meter u-grow">
              <div
                style={{ /* layout-ok: data-driven share width; speaker colour chosen at runtime */
                  width: `${Math.round(s.share * 100)}%`,
                  height: "100%",
                  background: isHostSpeaker(s.name) ? "var(--admin-accent)" : "var(--admin-muted)",
                }}
              />
            </div>
            <div className="admin-cell-muted u-right u-w-90">
              {Math.round(s.share * 100)}% · {s.words.toLocaleString()}w
            </div>
          </div>
        ))}
      </div>

      <div className="admin-card admin-section-card">
        <div className="admin-shelf-heading u-mb-2">Transcript</div>
        <div className="admin-scroll-lg">
          {stats.segments.map((seg, i) => (
            <div key={i} className="u-mb-3">
              <div className="u-sm">
                <span className={isHostSpeaker(seg.speaker) ? "admin-cell-strong" : undefined}>{seg.speaker}</span>{" "}
                <span className="admin-cell-muted">{seg.time}</span>
              </div>
              <div className="u-prewrap u-break-all">{seg.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
