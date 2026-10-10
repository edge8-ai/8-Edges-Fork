import Link from "next/link";
import type { PostMeta } from "@/entities/site";

// "Read in your first two days": the five things every onboarding plan opens
// with, in the plan's order, as tiles under the plan card on the /team home.
// Shown only while employment_stage is 'pre_boarding' or 'probation' (see
// TeamHome). The certification strip follows, when the deployment has a
// programme (lib/certification-programme.ts); the handbook tile likewise only
// when the deployment has one (lib/company-docs.ts), and it opens the portal's
// own /team/handbook page. External reading opens in a new tab so the
// workspace stays put.

import { CERTIFICATION_PROGRAMME as PROGRAMME } from "@/entities/team/lib/certification-programme";
import { HANDBOOK_DOC_PATH } from "@/entities/team/lib/company-docs";

type Tile = { title: string; sub: string; href: string; external?: boolean };

export function StartHerePanel({ coreTeaching, goalHint }: { coreTeaching: PostMeta; goalHint: string | null }) {
  const tiles: Tile[] = [
    ...(HANDBOOK_DOC_PATH ? [{ title: "Handbook", sub: "Contract, leave, pay, conduct", href: "/team/handbook" }] : []),
    { title: "Strategy", sub: "One sentence, three streams", href: "/team/strategy" },
    { title: "Values", sub: "Six, reviewed at day 60", href: "/team/values" },
    { title: "Company goals", sub: goalHint ?? "Four objectives with numbers", href: "/team/company-goals" },
    { title: coreTeaching.title, sub: `${coreTeaching.readTime}, required`, href: `/post/${coreTeaching.slug}`, external: true },
  ];

  return (
    <section aria-label="Read in your first two days">
      <div className="admin-hub-band-head">
        <h2 className="admin-card-title">Read in your first two days</h2>
      </div>
      <div className="admin-team-reads u-mb-4">
        {tiles.map((t) =>
          t.external ? (
            <a key={t.href} href={t.href} target="_blank" rel="noopener noreferrer" className="admin-card admin-team-read u-link-plain">
              <span className="admin-team-read-title">{t.title}</span>
              <span className="admin-cell-muted u-sm">{t.sub}</span>
            </a>
          ) : (
            <Link key={t.href} href={t.href} className="admin-card admin-team-read u-link-plain">
              <span className="admin-team-read-title">{t.title}</span>
              <span className="admin-cell-muted u-sm">{t.sub}</span>
            </Link>
          ),
        )}
      </div>

      {PROGRAMME && (
        <div className="admin-start-cta u-mb-4">
          <div className="admin-start-cta-body">
            <span className="admin-start-kicker light">Get certified</span>
            <span className="admin-start-cta-heading">
              Join {PROGRAMME.name} and start your certification
            </span>
            <ol className="admin-start-cta-steps">
              <li>Sign up using your company email.</li>
              <li>
                Complete the <b>{PROGRAMME.firstTrack}</b> certification during your probation.
              </li>
              <li>
                Then take <b>{PROGRAMME.secondTrack}</b> by your third month.
              </li>
            </ol>
          </div>
          <div className="admin-start-cta-actions">
            <a className="admin-start-btn" href={PROGRAMME.certificationUrl} target="_blank" rel="noopener noreferrer">
              Start the certification →
            </a>
            <a className="admin-start-btn ghost" href={PROGRAMME.homeUrl} target="_blank" rel="noopener noreferrer">
              Join {PROGRAMME.name}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
