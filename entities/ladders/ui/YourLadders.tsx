// "Your ladders" (LD.2; spec "The profile"; ADR 0021): the reader's own two
// ladders, marked Only you, on the Overview tab of their profile (LD.6). Each
// held tier as its emblem from the emblem module (LD.3), the Gold helm or the
// Legend medal with its star arc, the division or stars beneath it, then the
// points, the bar to the next tier, what each act earns and where each tier
// starts.
//
// It is drawn from a standing already read: the profile's own page
// (OwnProfile in ./profile/ProfilePages.tsx) reads the signed-in reader's standing once,
// behind ladders.mine, and hands it here, so no caller can hand it anyone
// else's. The Show switches that were on each ladder (LD.4) moved onto the
// profile's plaque with LD.6, beside the emblem they show.
//
// The game style (QS.11, Khoa 2026-10-21): with the reader's switch off the
// panel draws no art and speaks plainly, "Gold, division IV" instead of the
// helm and "IV", and "3 of 5 stars" instead of "★★★", and still shows every
// tier, point and bar.
import { Icon } from "@/kernel/ui/Icon";
import type { BuilderTier, LearnShareTier } from "../lib/points";
import type { LadderStanding, Standing } from "../lib/standing";
import { placeBeneath, placeWords } from "../lib/place-words";
import { Emblem } from "./Emblem";

const n = (v: number) => v.toLocaleString("en-US");

// The plain words for a Learn & Share act mirror Quests' plain view
// (entities/quests/ui/plain-model.ts, plainTally), which its door does not
// export: "answers", "sessions held", "shared outside".
function countsWords(s: LadderStanding, gameOn: boolean): string {
  const c = s.counts;
  const plural = (k: number, one: string, many: string) => `${n(k)} ${k === 1 ? one : many}`;
  if ("hits" in c) {
    const hits = gameOn ? plural(c.hits, "hit", "hits") : plural(c.hits, "answer", "answers");
    const fires = gameOn ? plural(c.fires, "fire hosted", "fires hosted") : plural(c.fires, "session held", "sessions held");
    const beacons = gameOn ? plural(c.beacons, "beacon lit", "beacons lit") : `${n(c.beacons)} shared outside`;
    return [hits, plural(c.sparks, "spark", "sparks"), fires, beacons].join(" · ");
  }
  return [plural(c.cards, "card shipped", "cards shipped"), `${n(c.humanTokens)} Human Tokens`].join(" · ");
}

/**
 * The held tier: in the game style its emblem from the emblem module (LD.3),
 * the Gold helm or the Legend medal with its star arc, and the division or
 * stars beneath it; plainly, the words alone.
 */
function Place({ s, gameOn }: { s: LadderStanding; gameOn: boolean }) {
  if (!gameOn) return <p className="yl-tier">{placeWords(s, false)}</p>;
  const beneath = placeBeneath(s);
  const label = placeWords(s, true);
  return (
    <div className="yl-place">
      {s.ladder === "learn_share" ? (
        <Emblem ladder="learn_share" tier={s.tier as LearnShareTier} size={72} label={label} />
      ) : (
        <Emblem ladder="builder" tier={s.tier as BuilderTier} size={84} stars={s.stars} band={s.immortalBand} label={label} />
      )}
      {beneath ? (
        <span className="yl-beneath" aria-hidden="true">
          {beneath}
        </span>
      ) : null}
    </div>
  );
}

function Ladder({ title, s, gameOn }: { title: string; s: LadderStanding; gameOn: boolean }) {
  const span = s.next ? s.next.start - s.start : 0;
  const pct = s.next && span > 0 ? Math.max(0, Math.min(100, Math.round(((s.points - s.start) / span) * 100))) : 100;
  return (
    <section className="yl-ladder" aria-labelledby={`yl-${s.ladder}`}>
      <p className="yl-name" id={`yl-${s.ladder}`}>
        {title}
      </p>
      <Place s={s} gameOn={gameOn} />
      <p className="yl-points">
        <strong>{n(s.shown)}</strong> points
      </p>
      <progress className="yl-bar" max={100} value={pct} aria-label={s.next ? `Towards ${s.next.tierName}` : `${s.tierName}, the top of the ladder`}>
        {pct}%
      </progress>
      <p className="yl-next">
        {s.next ? `${n(Math.ceil(s.next.toGo))} to ${s.next.tierName}, which starts at ${n(s.next.start)}` : "The top of the ladder. It stays open: points keep counting."}
      </p>
      <p className="yl-counts">{countsWords(s, gameOn)}</p>
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
  const gameOn = standing.display.gameStyle;
  return (
    <section className="pe-card yl" aria-labelledby="yl-h">
      <div className="yl-head">
        <h2 className="pe-h" id="yl-h">
          Your ladders
        </h2>
        <span className="yl-private">
          <Icon name="lock" />
          Only you
        </span>
      </div>
      <p className="pe-sub">Your tier only ever goes up. Nothing resets.</p>
      <div className="yl-pair">
        <Ladder title="Learn & Share" s={standing.learnShare} gameOn={gameOn} />
        <Ladder title="Builder" s={standing.builder} gameOn={gameOn} />
      </div>
      <Tables tables={standing.tables} />
    </section>
  );
}
