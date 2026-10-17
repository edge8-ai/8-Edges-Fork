import Link from "next/link";
import type { PostMeta } from "@/entities/site";

// "Read in your first two days": the five things every onboarding plan opens
// with, in the plan's order, as tiles under the plan card on the /team home.
// Shown only while employment_stage is 'pre_boarding' or 'probation' (see
// TeamHome). The handbook tile shows only when the deployment has a handbook
// (lib/company-docs.ts), and it opens the portal's own /team/handbook page.
// The certification strip follows the tiles when the training entity is
// installed and runs a programme; it arrives as `certification`, from the
// StartHereCertification slot. External reading opens in a new tab so the
// workspace stays put.

import type { ReactNode } from "react";
import { HANDBOOK_DOC_PATH } from "@/entities/team/lib/company-docs";

type Tile = { title: string; sub: string; href: string; external?: boolean };

export function StartHerePanel({ coreTeaching, goalHint, certification = null }: { coreTeaching: PostMeta; goalHint: string | null; certification?: ReactNode }) {
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

      {certification}
    </section>
  );
}
