// The season banner (QS.1; spec story 43): the fight the whole company is in.
// Company totals only, never a person's.
import { Glyph, type GlyphName } from "./art";
import type { QuestsPage } from "../lib/quests-read";

export function SeasonBanner({ season }: { season: QuestsPage["season"] }) {
  const tally: { glyph: GlyphName; tone: string; n: number; words: string }[] = [
    { glyph: "bounty", tone: "bounty", n: season.hits, words: season.hits === 1 ? "hit landed" : "hits landed" },
    { glyph: "raid", tone: "raid", n: season.campfires, words: season.campfires === 1 ? "campfire lit" : "campfires lit" },
    { glyph: "beacon", tone: "beacon", n: season.beacons, words: season.beacons === 1 ? "beacon lit" : "beacons lit" },
    { glyph: "page", tone: "page", n: season.discoveries, words: season.discoveries === 1 ? "discovery in the Lore" : "discoveries in the Lore" },
  ];
  return (
    <section className="qs-season" aria-label="This season">
      <div>
        <div className="qs-season-lbl">Season</div>
        <div className="qs-season-name">{season.name} · the whole company</div>
      </div>
      <div className="qs-tally">
        {tally.map((t) => (
          <div key={t.glyph}>
            <span className={`qs-glyph qs-glyph--${t.tone}`}>
              <Glyph name={t.glyph} />
            </span>
            <span>
              <b>{t.n}</b> {t.words}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
