import type { ParsedStrategy } from "@/entities/org/lib/company/strategy";
import { LINE_ICONS } from "@/entities/org/lib/company/strategy";

// Read-only designed rendering of the company strategy, shared by
// /team/strategy and the admin Company section. Takes the already-parsed
// strategy (see lib/company/strategy.ts) so both callers render identically.
export function StrategyView({ parsed }: { parsed: ParsedStrategy }) {
  const { strategy, statements, themes, currentTheme, slides, lines, overview, extras } = parsed;

  return (
    <>
      <div className="admin-team-strat-hero">
        <div className="admin-team-strat-hero-main">
          {currentTheme && (
            <span className="admin-start-kicker">
              {currentTheme.year} · {currentTheme.title}
            </span>
          )}
          <p className={`admin-team-strat-north${overview ? " admin-team-strat-north--overview" : ""}`}>
            {overview ?? strategy.title}
          </p>
          {/* The current year's theme is the kicker above; older themes trail
              behind it as a quiet timeline. */}
          {themes.filter((t) => t !== currentTheme).length > 0 && (
            <div className="admin-team-strat-themes">
              {themes
                .filter((t) => t !== currentTheme)
                .map((t) => (
                  <span key={t.year} className="admin-team-strat-theme">
                    {t.year} · {t.title}
                  </span>
                ))}
            </div>
          )}
        </div>
        {slides && (
          <div className="admin-team-strat-hero-side">
            <a href={slides.url} target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn--primary">
              {slides.label} →
            </a>
          </div>
        )}
      </div>

      {statements.length > 0 && (
        <div className="admin-team-strat-grid">
          {statements.map((s) => (
            <div key={s.label} className="admin-team-strat-card">
              <span className="admin-hub-ico" aria-hidden>
                {s.ico}
              </span>
              <span className="admin-team-strat-card-label">{s.label}</span>
              <span className="admin-team-strat-card-body">{s.body}</span>
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <>
          <h2 className="admin-section-label">How we win: three business lines</h2>
          <div className="admin-team-strat-grid">
            {lines.map((line, i) => (
              <div key={line.heading} className="admin-team-strat-card">
                <span className="admin-team-strat-card-head">
                  <span className="admin-hub-ico" aria-hidden>
                    {LINE_ICONS[i % LINE_ICONS.length]}
                  </span>
                  <span className="admin-team-strat-line-num">{String(i + 1).padStart(2, "0")}</span>
                </span>
                <span className="admin-team-strat-card-label">{line.heading}</span>
                <span className="admin-team-strat-card-body">{line.body}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {extras.map((s) => (
        <div key={s.heading}>
          <h2 className="admin-section-label">{s.heading}</h2>
          <div className="admin-card admin-section-card">
            <div className="admin-idea-plan" dangerouslySetInnerHTML={{ __html: s.html }} />
          </div>
        </div>
      ))}
    </>
  );
}
