// The Admin Home (AH.2) as drawn on the approved AH.1 canvas: the admin
// skin's own pieces (admin-kpi tiles, admin-section-card, admin-list rows,
// admin-badge), dense and plain, the way Admin pages are. Every word and every
// decision about what shows comes from lib/admin-home.ts; this file only draws.
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import type { AdminHomeModel, HomeBadge, HomeRow } from "@/entities/company-os/lib/admin-home-types";

function RowBadge({ badge }: { badge: HomeBadge | null }) {
  return badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null;
}

function Row({ row }: { row: HomeRow }) {
  const main = (
    <span className="admin-list-main">
      <span className="admin-list-title">{row.title}</span>
      {row.sub && <span className="admin-list-sub">{row.sub}</span>}
    </span>
  );
  const lead = row.initials ? (
    <span className="admin-home-person">
      <span className="admin-face" aria-hidden>
        {row.initials}
      </span>
      {main}
    </span>
  ) : (
    main
  );
  // A row with an action is a row with a button; the button is the link, so
  // the row does not nest one link inside another.
  if (row.action && row.href) {
    return (
      <div className="admin-list-row">
        {lead}
        <span className="admin-list-aside admin-list-aside--row">
          <RowBadge badge={row.badge} />
          <Link href={row.href} className="admin-btn admin-btn--sm">
            {row.action}
          </Link>
        </span>
      </div>
    );
  }
  const aside = row.badge ? (
    <span className="admin-list-aside">
      <RowBadge badge={row.badge} />
    </span>
  ) : null;
  return row.href ? (
    <Link href={row.href} className="admin-list-row">
      {lead}
      {aside}
    </Link>
  ) : (
    <div className="admin-list-row">
      {lead}
      {aside}
    </div>
  );
}

function Card({ id, title, link, note, children }: { id: string; title: string; link?: { label: string; href: string } | null; note?: string; children: ReactNode }) {
  return (
    <section className="admin-card admin-section-card" id={id} aria-labelledby={`${id}-h`}>
      <div className="admin-card-head">
        <h2 className="admin-card-title" id={`${id}-h`}>
          {title}
        </h2>
        {link ? (
          <Link href={link.href} className="admin-auth-link">
            {link.label} →
          </Link>
        ) : note ? (
          <span className="admin-cell-muted u-sm">{note}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Failed({ what }: { what: string }) {
  return <p className="admin-alert admin-alert--err">Couldn&rsquo;t load {what} just now.</p>;
}

function GroupHead({ label, count, tone }: { label: string; count?: number; tone?: HomeBadge["tone"] }) {
  return (
    <h3 className="admin-eyebrow admin-home-group-h">
      {label}
      {count !== undefined && <Badge tone={tone ?? "neutral"}>{count}</Badge>}
    </h3>
  );
}

function More({ link }: { link: { label: string; href: string } | null }) {
  return link ? (
    <Link href={link.href} className="admin-auth-link admin-home-more">
      {link.label} →
    </Link>
  ) : null;
}

export function AdminHome({ model }: { model: AdminHomeModel }) {
  const { waiting, cards, promises, deals, team, company } = model;
  const left = waiting || cards || promises;
  const right = deals || team || company;
  return (
    <div className="admin-home">
      <PageHead eyebrow={model.eyebrow} title={model.greeting} sub={model.summary} />

      {model.tiles.length > 0 && (
        <div className="admin-kpi-grid admin-home-tiles">
          {model.tiles.map((t) => (
            <a key={t.label} className="admin-kpi" href={t.href}>
              <div className="admin-kpi-label">{t.label}</div>
              <div className="admin-kpi-val">{t.value}</div>
              <div className="admin-kpi-note">{t.note}</div>
            </a>
          ))}
        </div>
      )}

      <div className="admin-home-cols">
        {left && (
          <div className="admin-home-stack">
            {waiting && (
              <Card id="waiting" title="Waiting on you" note={waiting.failed ? undefined : String(waiting.rows.length)}>
                {waiting.failed ? (
                  <Failed what="what is waiting on you" />
                ) : (
                  <div className="admin-list">
                    {waiting.rows.map((r) => (
                      <Row key={r.key} row={r} />
                    ))}
                  </div>
                )}
              </Card>
            )}

            {cards && (
              <Card id="cards" title="Your cards" link={cards.failed ? null : { label: "My week", href: cards.myWeekHref }}>
                {cards.failed ? (
                  <Failed what="your cards" />
                ) : (
                  <div className="admin-list">
                    {cards.overdueCount > 0 && (
                      <>
                        <GroupHead label="Overdue" count={cards.overdueCount} tone="err" />
                        {cards.overdue.map((r) => (
                          <Row key={r.key} row={r} />
                        ))}
                        <More link={cards.overdueMore} />
                      </>
                    )}
                    <GroupHead label="Due this sprint" count={cards.dueCount} />
                    {cards.due.map((r) => (
                      <Row key={r.key} row={r} />
                    ))}
                    {cards.dueQuiet && <div className="admin-home-quiet">{cards.dueQuiet}</div>}
                    <More link={cards.dueMore} />
                  </div>
                )}
              </Card>
            )}

            {promises && (
              <Card id="promises" title="Your promises from 1-1s" link={promises.failed ? null : { label: "Coaching", href: promises.href }}>
                {promises.failed ? (
                  <Failed what="your promises" />
                ) : (
                  <div className="admin-list">
                    <GroupHead label={promises.heading} count={promises.headingCount} tone={promises.late ? "err" : "neutral"} />
                    {promises.rows.map((r) => (
                      <Row key={r.key} row={r} />
                    ))}
                    <More link={promises.more} />
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {right && (
          <div className="admin-home-stack">
            {deals && (
              <Card id="deals" title="Deal follow-ups" link={deals.failed ? null : { label: "Pipeline", href: deals.href }}>
                {deals.failed ? (
                  <Failed what="your deals" />
                ) : (
                  <div className="admin-list">
                    {deals.rows.map((r) => (
                      <Row key={r.key} row={r} />
                    ))}
                    {deals.more && <span className="admin-list-sub admin-home-more">{deals.more}</span>}
                  </div>
                )}
              </Card>
            )}

            {team && (
              <Card id="team" title="Team this week" link={!team.failed && team.href ? { label: "People", href: team.href } : null}>
                {team.failed ? (
                  <Failed what="the team's week" />
                ) : (
                  <div className="admin-list">
                    {team.groups.map((g) => (
                      <div key={g.label}>
                        <GroupHead label={g.label} />
                        {g.rows.map((r) => (
                          <Row key={r.key} row={r} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {company && (
              <Card id="company" title="Company" link={company.failed ? null : { label: "Dashboard", href: company.href }}>
                {company.failed ? (
                  <Failed what="the company figures" />
                ) : (
                  <div className="admin-list">
                    {company.rows.map((r) => (
                      <div key={r.label} className="admin-list-row">
                        <span className="admin-list-sub">{r.label}</span>
                        <span className="admin-home-value">{r.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
