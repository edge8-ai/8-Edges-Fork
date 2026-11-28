// The programme read on My Team › Training (TR.7), in the team hub's own
// language: a card per slice in its type's colour, the stars, the load band
// the review form uses, the feelings, and who went. A hidden slice is a
// locked card that says why; a refused period says so instead of the cards.
// No card is a person (ADR 0016).
import Link from "next/link";
import type { ProgrammeView, ViewSlice } from "../lib/programme-read";
import { PERIODS, PERIOD_LABEL, hiddenSentence, type Period } from "../lib/programme-read-rules";
import { loadSegments, loadShares, notWentLine, segmentClasses, starsLabel, wentShare } from "./programme-format";
import { ProgrammeNotes } from "./ProgrammeNotes";
import { LockIcon, StarIcon } from "./programme-icons";
import { StoryBubble } from "./ProgrammeStory";
import type { Story } from "../lib/narrations";

const GROUPS: { grain: ViewSlice["grain"]; label: string }[] = [
  { grain: "type", label: "By training type" },
  { grain: "plan", label: "By plan" },
];

export function ProgrammeCards({ view, period, basePath, stories = new Map() }: { view: ProgrammeView; period: Period; basePath: string; stories?: ReadonlyMap<string, Story> }) {
  return (
    <section className="admin-card admin-section-card tr-card" aria-label="How it's landing">
      <div className="tr-card-head">
        <div>
          <h2 className="tr-card-title">How it&apos;s landing</h2>
          <p className="tr-hint">From the reviews and attendance of the trainings you organise and the ones your team takes.</p>
        </div>
        <nav className="tr-pr-periods" aria-label="Period">
          {PERIODS.map((p) => (
            <Link key={p} href={p === "start" ? basePath : `${basePath}?period=${p}`} className={`tr-chip${p === period ? " is-on" : ""}`} aria-current={p === period ? "page" : undefined} scroll={false}>
              {PERIOD_LABEL[p]}
            </Link>
          ))}
        </nav>
      </div>
      {view.refused ? (
        <div className="tr-pr-hidden-body">
          <span className="tr-pr-hidden-ico">
            <LockIcon />
          </span>
          <div>
            <p className="tr-pr-hidden-t">Not shown for this period</p>
            <p className="tr-hint">Fewer than three people reviewed a training in it, so showing it could single someone out. Pick a wider period.</p>
          </div>
        </div>
      ) : view.slices.length === 0 ? (
        <p className="tr-hint">No training in your scope has started yet. Once one has, how it landed shows here.</p>
      ) : (
        GROUPS.map((g) => {
          const cards = view.slices.filter((s) => s.grain === g.grain);
          if (cards.length === 0) return null;
          return (
            <div key={g.grain}>
              <p className="tr-pr-group">{g.label}</p>
              <div className="tr-pr-grid">
                {cards.map((s) => (
                  <SliceCard key={s.key} slice={s} story={stories.get(s.key) ?? null} />
                ))}
              </div>
            </div>
          );
        })
      )}
      <p className="tr-pr-privacy">Nobody&apos;s own reviews or skips show here, only what three or more people said together. That holds for admins too.</p>
    </section>
  );
}

function SliceCard({ slice: s, story }: { slice: ViewSlice; story: Story | null }) {
  const head = (
    <div className="tr-pr-card-head">
      <div>
        <h3 className="tr-pr-card-title">{s.name}</h3>
        <p className="tr-pr-card-sub">{s.sub}</p>
      </div>
      {s.shown && <span className="tr-count">{s.figures.reviewers} people</span>}
    </div>
  );
  if (!s.shown) {
    return (
      <article className="tr-pr-card is-hidden" aria-label={s.name}>
        {head}
        <div className="tr-pr-hidden-body">
          <span className="tr-pr-hidden-ico">
            <LockIcon />
          </span>
          <div>
            <p className="tr-pr-hidden-t">{s.reason === "few" ? "Hidden for now" : "Hidden beside another slice"}</p>
            <p className="tr-hint">{s.reason === "few" ? "Fewer than three people have reviewed it. It shows here once three have." : hiddenSentence(s)}</p>
          </div>
        </div>
      </article>
    );
  }
  const f = s.figures;
  const load = loadShares(f);
  const full = Math.round(f.stars);
  const went = wentShare(f);
  return (
    <article className={`tr-pr-card${s.tone ? ` ${s.tone}` : ""}`} aria-label={s.name}>
      {head}
      {story && <StoryBubble story={story} />}
      <div className="tr-pr-big">
        <span className="tr-pr-big-num">{starsLabel(f)}</span>
        <span className="tr-pr-big-stars" role="img" aria-label={`${starsLabel(f)} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <StarIcon key={i} className={i <= full ? "is-on" : "is-off"} />
          ))}
        </span>
        <span className="tr-pr-card-sub">{f.reviews} reviews</span>
      </div>
      {load.answered > 0 && (
        <div>
          <span className="tr-label">Load</span>
          <div className="tr-pr-band" role="img" aria-label={`${load.little}% too little, ${load.right}% about right, ${load.much}% too much`}>
            {loadSegments(f).map((c, i) => (
              <span key={i} className={c} />
            ))}
          </div>
          <p className="tr-bar-labels">
            Too little {load.little}% · about right {load.right}% · too much {load.much}%
          </p>
        </div>
      )}
      {f.tags.length > 0 && (
        <div>
          <span className="tr-label">How it felt</span>
          <div className="tr-pr-feel">
            {f.tags.slice(0, 4).map((t) => (
              <span key={t.label}>
                {t.label}
                <b>{t.n}</b>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="tr-pr-went">
        <span className="tr-label">Who went</span>
        <div className="tr-pr-went-bar" role="img" aria-label={`${went}% went`}>
          {segmentClasses([
            { cls: "is-went", n: f.went },
            { cls: "is-not", n: f.listed - f.went },
          ]).map((c, i) => (
            <span key={i} className={c} />
          ))}
        </div>
        <span className="tr-pr-went-line">
          <strong>
            {f.went} of {f.listed}
          </strong>{" "}
          went · {notWentLine(f)}
        </span>
      </div>
      <ProgrammeNotes slice={s.name} notes={s.notes} className="admin-btn admin-btn--sm tr-btn-quiet" />
    </article>
  );
}
