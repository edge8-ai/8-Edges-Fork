// /portal/training/[planId]: one training plan, as the client reads it (ADR
// 0016, amended 2026-11-19). The weekly recaps exactly as they were emailed to
// the client, each session's lesson summary once its recap is published, and
// beside them the programme's purpose, how it runs and who is on it. Nothing
// a learner said, nothing a teacher wrote to a learner, no assessment: the read
// (client-read.ts) selects none of it. A plan that is not this client's is a
// not-found, the same as one that does not exist.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { Badge } from "@/kernel/ui/Badge";
import { formatDate } from "@/kernel/ui/format";
import { whenLabel } from "@/entities/training/lib/training-format";
import { weekLabel } from "@/entities/training/lib/weekly-recap-rules";
import { clientPlan } from "@/entities/training/lib/client-read";

export const metadata = { title: "Training programme", description: "One training programme: its weekly recaps and its sessions." };

export default async function PortalTrainingPlanPage(props: { params: Promise<{ planId: string }> }) {
  const actor = await requirePortalPermission("surface.portal");
  const { planId } = await props.params;
  const plan = await clientPlan(actor, planId, new Date());
  if (!plan) notFound();
  const upcoming = plan.sessions.filter((s) => !s.held).reverse();
  const held = plan.sessions.filter((s) => s.held);

  return (
    <>
      <PageHead
        eyebrow={<Link href="/portal/training">Client Portal · Training</Link>}
        title={plan.title}
        sub={plan.rhythm ? `${plan.rhythm} (GMT+7)` : undefined}
      />
      <div className="u-grid-2-1">
        <div>
          <section className="admin-card admin-section-card u-mb-4" aria-label="Weekly recaps">
            <h2 className="admin-card-title u-mb-3">Weekly recaps</h2>
            {plan.recaps.length === 0 ? (
              <div className="admin-empty">The first weekly recap is sent on a Friday after the week&apos;s sessions.</div>
            ) : (
              plan.recaps.map((r) => (
                <article key={r.weekStart} className="admin-block-divided">
                  <div className="admin-card-head">
                    <h3 className="admin-card-title">{weekLabel(r.weekStart)}</h3>
                    {r.sentAt && <span className="admin-cell-muted u-sm">Sent {formatDate(r.sentAt)}</span>}
                  </div>
                  {r.instructorNote && <p className="u-prewrap">{r.instructorNote}</p>}
                  <div className="u-sm u-muted">This week</div>
                  <p className="u-prewrap">{r.thisWeek}</p>
                  {r.attendance && (
                    <>
                      <div className="u-sm u-muted">Attendance and homework</div>
                      <p className="u-prewrap">{r.attendance}</p>
                    </>
                  )}
                  {r.progress.length > 0 && (
                    <>
                      <div className="u-sm u-muted">Progress</div>
                      {r.progress.map((p) => (
                        <p key={p.name} className="u-prewrap">
                          <strong>{p.name}:</strong> {p.md}
                        </p>
                      ))}
                    </>
                  )}
                  {r.nextWeek && (
                    <>
                      <div className="u-sm u-muted">Next week</div>
                      <p className="u-prewrap">{r.nextWeek}</p>
                    </>
                  )}
                </article>
              ))
            )}
          </section>
          <section className="admin-card admin-section-card" aria-label="Sessions held">
            <h2 className="admin-card-title u-mb-3">Sessions held</h2>
            {held.length === 0 ? (
              <div className="admin-empty">No sessions held yet.</div>
            ) : (
              <div className="admin-list">
                {held.map((s) => (
                  <div key={s.id} className="admin-list-row">
                    <div className="admin-list-main">
                      <div className="admin-list-title">{whenLabel(s.startsAt, s.endsAt)}</div>
                      <div className="admin-list-sub u-prewrap">{s.summary ?? "The lesson summary is not published yet."}</div>
                    </div>
                    <div className="admin-list-aside">{s.summary ? <Badge tone="ok">Summary</Badge> : <Badge>Pending</Badge>}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div>
          {plan.purpose && (
            <section className="admin-card admin-section-card u-mb-4" aria-label="Purpose">
              <h2 className="admin-card-title u-mb-3">Purpose</h2>
              <p>{plan.purpose}</p>
            </section>
          )}
          {plan.halves && (
            <section className="admin-card admin-section-card u-mb-4" aria-label="How it runs">
              <h2 className="admin-card-title u-mb-3">How it runs</h2>
              <div className="u-sm u-muted">Prepared</div>
              <p>{plan.halves.presentation}</p>
              <div className="u-sm u-muted">On the spot</div>
              <p>{plan.halves.reactive}</p>
            </section>
          )}
          <section className="admin-card admin-section-card u-mb-4" aria-label="Learners">
            <h2 className="admin-card-title u-mb-3">Learners</h2>
            {plan.learners.length === 0 ? <div className="admin-empty">Nobody on the programme yet.</div> : <p>{plan.learners.join(", ")}</p>}
          </section>
          <section className="admin-card admin-section-card" aria-label="Upcoming sessions">
            <h2 className="admin-card-title u-mb-3">Upcoming</h2>
            {upcoming.length === 0 ? (
              <div className="admin-empty">Nothing scheduled.</div>
            ) : (
              <div className="admin-list">
                {upcoming.slice(0, 5).map((s) => (
                  <div key={s.id} className="admin-list-row">
                    <div className="admin-list-main">
                      <div className="admin-list-title">{whenLabel(s.startsAt, s.endsAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
