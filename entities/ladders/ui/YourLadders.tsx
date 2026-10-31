// "Your ladders" (LD.2; spec "The profile"; ADR 0021): the Overview tab of the
// reader's own profile, marked Only you. Since LD.10 (28 Oct 2026) the tier,
// the points and the bar to the next tier sit on the rank cards at the top of
// the game screen, so this panel says where the points come from: each
// ladder's acts counted, then what each act earns and where each tier starts.
//
// It is drawn from a standing already read: the profile's own page
// (OwnProfile in ./profile/ProfilePages.tsx) reads the signed-in reader's
// standing once, behind ladders.mine, and hands it here, so no caller can hand
// it anyone else's. It shows only in the game style; with the reader's switch
// off their profile is the postcard view and draws no ladders.
import { Icon } from "@/kernel/ui/Icon";
import type { BuilderCounts, LearnShareCounts } from "../lib/points";
import type { Standing } from "../lib/standing";

const n = (v: number) => v.toLocaleString("en-US");

type Tally = { value: number; words: string };

function Tallies({ title, id, points, tallies }: { title: string; id: string; points: number; tallies: Tally[] }) {
  return (
    <section className="yl-ladder" aria-labelledby={id}>
      <div className="yl-ladder-head">
        <h3 className="yl-name" id={id}>
          {title}
        </h3>
        <span className="yl-points">
          <strong>{n(points)}</strong> points
        </span>
      </div>
      <ul className="yl-tallies">
        {tallies.map((t) => (
          <li key={t.words} className="yl-tally">
            <b>{n(t.value)}</b>
            <span>{t.words}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tables({ tables }: { tables: Standing["tables"] }) {
  const ls = tables.learnShare.acts;
  const b = tables.builder.acts;
  return (
    <details className="yl-tables">
      <summary>What earns points, and where each tier starts</summary>
      <div className="yl-tables-grid">
        <div>
          <p className="yl-tables-h">Learn &amp; Share</p>
          <ul>
            <li>A Turn-in on a Bounty: {ls.hit}</li>
            <li>A spark or a learning: {ls.spark}</li>
            <li>A Raid you hosted that someone came to: {ls.fire}</li>
            <li>A Beacon lit: {ls.beacon}</li>
          </ul>
          <p className="yl-starts">{tables.learnShare.starts.map((t) => `${t.tierName} ${n(t.start)}`).join(" · ")}</p>
          <p className="yl-hint">Each tier has four divisions, IV up to I. Sovereign is the open top.</p>
        </div>
        <div>
          <p className="yl-tables-h">Builder</p>
          <ul>
            <li>A card with no subtasks moved to Done: {b.perHumanToken} per Human Token</li>
            <li>The same card with no Human Tokens: {b.unsizedCard}</li>
          </ul>
          <p className="yl-starts">{tables.builder.starts.map((t) => `${t.tierName} ${n(t.start)}`).join(" · ")}</p>
          <p className="yl-hint">
            Each tier has five stars. Immortal is the open top, with bands at {tables.builder.immortalBands.map(n).join(", ")}.
          </p>
        </div>
      </div>
    </details>
  );
}

/** The panel, drawn from a standing already read; exported for its render tests. */
export function YourLaddersView({ standing }: { standing: Standing }) {
  const ls = standing.learnShare.counts as LearnShareCounts;
  const b = standing.builder.counts as BuilderCounts;
  return (
    <section className="yl" aria-labelledby="yl-h">
      <div className="yl-head">
        <h2 className="yl-h" id="yl-h">
          Where your points come from
        </h2>
        <span className="yl-private">
          <Icon name="lock" />
          Only you
        </span>
      </div>
      <div className="yl-pair">
        <Tallies
          title="Builder"
          id="yl-builder"
          points={standing.builder.shown}
          tallies={[
            { value: b.cards, words: b.cards === 1 ? "card shipped" : "cards shipped" },
            { value: b.humanTokens, words: "Human Tokens" },
          ]}
        />
        <Tallies
          title="Learn & Share"
          id="yl-learn_share"
          points={standing.learnShare.shown}
          tallies={[
            { value: ls.sparks, words: ls.sparks === 1 ? "spark" : "sparks" },
            { value: ls.hits, words: ls.hits === 1 ? "hit" : "hits" },
            { value: ls.fires, words: ls.fires === 1 ? "fire hosted" : "fires hosted" },
            { value: ls.beacons, words: ls.beacons === 1 ? "beacon lit" : "beacons lit" },
          ]}
        />
      </div>
      <Tables tables={standing.tables} />
    </section>
  );
}
