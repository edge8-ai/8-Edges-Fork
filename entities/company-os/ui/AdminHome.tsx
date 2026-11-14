// The Admin Home (AH.2, redrawn as AH.4): Do first, then Decisions, then the
// reader's cards beside their deal follow-ups, then the fortnight as a strip
// of days with the company's figures under it. Built from the admin skin's own
// pieces (admin-section-card, admin-list rows, admin-badge); every word and
// every decision about what shows comes from lib/admin-home.ts, so this file
// only draws.
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/kernel/ui/Badge";
import { PageHead } from "@/kernel/ui/PageHead";
import type { AdminHomeModel, HomeBadge, HomeLink, HomeRow } from "@/entities/company-os/lib/admin-home-types";
import { HomeActRow, type HomeActions } from "./HomeActRow";

function RowBadge({ badge }: { badge: HomeBadge | null }) {
  return badge ? <Badge tone={badge.tone}>{badge.text}</Badge> : null;
}

function Row({ row, actions }: { row: HomeRow; actions?: HomeActions }) {
  // A row that acts in place (AH.5) keeps its title as the way into the full
  // record, and its buttons do the rest.
  const acting = Boolean(row.act && actions);
  const main = (
    <span className="admin-list-main">
      {acting && row.href ? (
        <Link href={row.href} className="admin-list-title admin-home-title-link">
          {row.title}
        </Link>
      ) : (
        <span className="admin-list-title">{row.title}</span>
      )}
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
  if (row.act && actions) {
    return (
      <HomeActRow act={row.act} actions={actions}>
        {lead}
        <RowBadge badge={row.badge} />
      </HomeActRow>
    );
  }
  // A folded group opens in place, each of its rows with its own buttons.
  if (row.children && actions) {
    return (
      <details className="admin-home-group">
        <summary className="admin-list-row">
          {lead}
          <span className="admin-btn admin-btn--sm">{row.action ?? "Open"}</span>
        </summary>
        <div className="admin-home-sub">
          {row.children.map((c) => (
            <Row key={c.key} row={c} actions={actions} />
          ))}
        </div>
      </details>
    );
  }
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

function Card({ id, title, link, note, className, children }: { id: string; title: string; link?: HomeLink | null; note?: string | null; className?: string; children: ReactNode }) {
  return (
    <section className={className ? `admin-card admin-section-card ${className}` : "admin-card admin-section-card"} id={id} aria-labelledby={`${id}-h`}>
      <div className="admin-card-head">
        <h2 className="admin-card-title" id={`${id}-h`}>
          {title}
          {note && <span className="admin-home-note">{note}</span>}
        </h2>
        {link && (
          <Link href={link.href} className="admin-auth-link">
            {link.label} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Failed({ what }: { what: string }) {
  return <p className="admin-alert admin-alert--err">Couldn&rsquo;t load {what} just now.</p>;
}

function GroupHead({ label, count, tone }: { label: string; count: number; tone?: HomeBadge["tone"] }) {
  return (
    <h3 className="admin-eyebrow admin-home-group-h">
      {label}
      <Badge tone={tone ?? "neutral"}>{count}</Badge>
    </h3>
  );
}

function More({ link }: { link: HomeLink | null }) {
  return link ? (
    <Link href={link.href} className="admin-auth-link admin-home-more">
      {link.label} →
    </Link>
  ) : null;
}

export function AdminHome({ model, actions }: { model: AdminHomeModel; actions?: HomeActions }) {
  const { first, waiting, cards, deals, week, company } = model;
  return (
    <div className="admin-home">
      <PageHead eyebrow={model.eyebrow} title={model.greeting} sub={model.summary} />

      {first.length > 0 && (
        <Card id="first" title="Do first" note="due today, and only you can do it" className="admin-home-first">
          <div className="admin-list">
            {first.map((r) => (
              <Row key={r.key} row={r} actions={actions} />
            ))}
          </div>
        </Card>
      )}

      {waiting && (
        <Card id="waiting" title="Decisions" note={waiting.failed ? null : waiting.note}>
          {waiting.failed ? (
            <Failed what="what is waiting on you" />
          ) : (
            <div className="admin-list">
              {waiting.rows.map((r) => (
                <Row key={r.key} row={r} actions={actions} />
              ))}
            </div>
          )}
        </Card>
      )}

      {(cards || deals) && (
        <div className="admin-home-cols">
          {cards && (
            <Card id="cards" title="Your cards" note={cards.failed ? null : cards.note} link={cards.failed ? null : { label: "My week", href: cards.myWeekHref }}>
              {cards.failed ? (
                <Failed what="your cards" />
              ) : (
                <div className="admin-list">
                  {cards.lateCount > 0 && <GroupHead label="Late" count={cards.lateCount} tone="err" />}
                  {cards.late.map((r) => (
                    <Row key={r.key} row={r} actions={actions} />
                  ))}
                  {cards.dueCount > 0 && <GroupHead label="Later this sprint" count={cards.dueCount} />}
                  {cards.due.map((r) => (
                    <Row key={r.key} row={r} actions={actions} />
                  ))}
                  {cards.quiet && <div className="admin-home-quiet">{cards.quiet}</div>}
                  <More link={cards.more} />
                  {cards.hint && (
                    <Link href={cards.hint.href} className="admin-home-hint">
                      {cards.hint.label} →
                    </Link>
                  )}
                </div>
              )}
            </Card>
          )}

          {deals && (
            <Card id="deals" title="Deal follow-ups" note={deals.failed ? null : deals.note} link={deals.failed ? null : { label: "Pipeline", href: deals.href }}>
              {deals.failed ? (
                <Failed what="your deals" />
              ) : (
                <div className="admin-list">
                  {deals.rows.map((r) => (
                    <Row key={r.key} row={r} actions={actions} />
                  ))}
                  {deals.more && <span className="admin-list-sub admin-home-more">{deals.more}</span>}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {(week || company) && (
        <Card id="week" title="The next two weeks" link={week && !week.failed && week.href ? { label: "People", href: week.href } : null}>
          {week?.failed ? (
            <Failed what="the team's dates" />
          ) : week ? (
            <>
              {week.days.length > 0 && (
                <ol className="admin-home-days">
                  {week.days.map((d) => (
                    <li key={d.date} className={`admin-home-day${d.today ? " admin-home-day--today" : ""}`}>
                      <span className="admin-home-day-label">{d.label}</span>
                      {d.events.map((e) => (
                        <span key={e.key} className="admin-home-day-event">
                          {e.text}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
              )}
              {week.links.length > 0 && (
                <p className="admin-home-links">
                  {week.links.map((l) =>
                    l.href ? (
                      <Link key={l.label} href={l.href} className="admin-auth-link">
                        {l.label}
                      </Link>
                    ) : (
                      <span key={l.label} className="admin-cell-muted">
                        {l.label}
                      </span>
                    ),
                  )}
                </p>
              )}
            </>
          ) : null}
          {company &&
            (company.failed ? (
              <Failed what="the company figures" />
            ) : (
              <Link href={company.href} className="admin-home-pulse">
                {company.rows.map((r) => (
                  <span key={r.label}>
                    <span className="admin-home-pulse-label">{r.label}</span> <span className="admin-home-value">{r.value}</span>
                  </span>
                ))}
              </Link>
            ))}
        </Card>
      )}
    </div>
  );
}
