// /portal/training: the training Edge8 runs for this client's placed staff
// (ADR 0016, amended 2026-11-19). One row per plan its organiser linked to the
// client, each opening its own page. Read through client-read.ts, the one
// allow-listed read a client has of training.
import Link from "next/link";
import { requirePortalPermission } from "@/kernel/identity/access-request";
import { PageHead } from "@/kernel/ui/PageHead";
import { formatDate } from "@/kernel/ui/format";
import { clientPlans } from "@/entities/training/lib/client-read";

export const metadata = { title: "Training", description: "The training programmes Edge8 runs for your team." };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function PortalTrainingPage() {
  const actor = await requirePortalPermission("surface.portal");
  const plans = await clientPlans(actor, new Date());

  return (
    <>
      <PageHead eyebrow="Client Portal" title="Training" sub="The programmes Edge8 runs for your team." />
      <section className="admin-card admin-section-card">
        {plans.length === 0 ? (
          <div className="admin-empty">No training programmes yet.</div>
        ) : (
          <div className="admin-list">
            {plans.map((p) => (
              <Link key={p.id} href={`/portal/training/${p.id}`} className="admin-list-row u-link-plain">
                <div className="admin-list-main">
                  <div className="admin-list-title">{p.title}</div>
                  <div className="admin-list-sub">
                    {p.rhythm} (GMT+7) · {plural(p.learners, "learner", "learners")} · {plural(p.held, "session", "sessions")} held · {plural(p.summaries, "lesson summary", "lesson summaries")}
                  </div>
                </div>
                <div className="admin-list-aside admin-list-aside--wraps">
                  {p.nextAt && <span className="admin-cell-muted u-sm">Next session {formatDate(p.nextAt)}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
