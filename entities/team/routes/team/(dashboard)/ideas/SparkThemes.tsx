import Link from "next/link";
import { Tabs } from "@/kernel/ui/Tabs";
import { formatDate, initials } from "@/kernel/ui/format";
import type { ThemeView } from "@/entities/ideas";
import { avatarTone, fieldHref, readFieldFilter } from "./sparks-model";

// What the team keeps raising (W.189, Dave on 8 Oct). The themes Claude found
// across the sparks this morning, one tab each for "We should build" and "We
// should learn", the themes more people raised first. Faces say who, never a
// score; the morning routine is the only writer (entities/ideas/crons/idea-themes).

const LISTED = 4;
const FACES = 5;

function ThemeCard({ t }: { t: ThemeView }) {
  const more = t.sparks.length - LISTED;
  return (
    <article className="sparks-theme">
      <div className="sparks-theme-top">
        <h3>{t.title}</h3>
        {/* role="img" so the label is read; a plain span with aria-label is skipped (UI review, 8 Oct). */}
        <span className="sparks-faces" role="img" aria-label={`Raised by ${t.people.map((p) => p.name).join(", ")}`}>
          {t.people.slice(0, FACES).map((p) => (
            <span key={p.personId} className={`sparks-avatar sparks-avatar--sm sparks-avatar--${avatarTone(p.personId)}`} aria-hidden="true">
              {initials(p.name)}
            </span>
          ))}
          {t.people.length > FACES && (
            <span className="sparks-avatar sparks-avatar--sm sparks-avatar--more" aria-hidden="true">
              +{t.people.length - FACES}
            </span>
          )}
        </span>
      </div>
      <p className="sparks-theme-gist">{t.gist}</p>
      <div className="sparks-theme-facts">
        <span className="sparks-theme-chip">
          {t.sparks.length} {t.kind === "learning" ? "learnings" : "sparks"}
        </span>
        <span className="sparks-theme-chip">{t.people.length} people</span>
        {t.pickedUp > 0 && <span className="sparks-theme-chip is-picked">{t.pickedUp} picked up</span>}
        {t.repeats.map((r) => (
          <span key={r} className="sparks-theme-chip is-again">
            Asked twice: {r}
          </span>
        ))}
        {t.related > 0 && (
          <span className="sparks-theme-chip is-cross">
            Also {t.related} {t.kind === "learning" ? (t.related === 1 ? "build" : "builds") : t.related === 1 ? "learning" : "learnings"}
          </span>
        )}
      </div>
      <ul className="sparks-theme-list">
        {t.sparks.slice(0, LISTED).map((s) => (
          <li key={s.id}>
            <Link className="sparks-theme-spark" href={`/team/ideas/${s.id}`}>
              <span>{s.title}</span>
              <span className="sparks-theme-who">{s.who}</span>
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li>
            <Link className="sparks-theme-spark sparks-theme-more" href={fieldHref(readFieldFilter({ kind: t.kind === "learning" ? "learning" : "build" }), { all: true })}>
              <span>+ {more} more in All sparks</span>
            </Link>
          </li>
        )}
      </ul>
    </article>
  );
}

export function SparkThemes({ themes, generatedAt, unthemed }: { themes: ThemeView[] | null; generatedAt: string | null; unthemed: number }) {
  const build = (themes ?? []).filter((t) => t.kind === "build");
  const learn = (themes ?? []).filter((t) => t.kind === "learning");
  return (
    <section className="sparks-themes" aria-labelledby="themes-h">
      <div className="sparks-field-head">
        <h2 id="themes-h" className="sparks-h2">
          What the team keeps raising
        </h2>
        <span className="sparks-lede">Sparks that say the same thing, grouped. The more people behind a theme, the higher it sits.</span>
      </div>
      {!themes || themes.length === 0 ? (
        <div className="sparks-empty">Claude groups the sparks into themes each morning. The first ones show here after the next run.</div>
      ) : (
        <>
          <Tabs
            tabs={[
              {
                key: "build",
                label: "We should build",
                count: build.length,
                content: (
                  <div key="build" className="sparks-themes-grid">
                    {build.map((t) => (
                      <ThemeCard key={t.title} t={t} />
                    ))}
                  </div>
                ),
              },
              {
                key: "learning",
                label: "We should learn",
                count: learn.length,
                content: (
                  <div key="learning" className="sparks-themes-grid">
                    {learn.map((t) => (
                      <ThemeCard key={t.title} t={t} />
                    ))}
                  </div>
                ),
              },
            ]}
          />
          <div className="sparks-themes-foot">
            <span>
              Grouped by Claude from what you wrote, each morning{generatedAt ? `, last on ${formatDate(generatedAt)}` : ""}. A theme needs sparks
              from at least two people.
            </span>
            {unthemed > 0 && (
              <span>
                {unthemed} {unthemed === 1 ? "spark doesn't" : "sparks don't"} share a theme yet
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
